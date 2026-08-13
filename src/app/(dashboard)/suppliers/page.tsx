
"use client"

import { useState, useEffect, useMemo } from "react"
import { SupplierService } from "@/services/supplier.service"
import { Supplier, CurrencyCode } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Plus,
  Search,
  Loader2,
  Truck,
  Globe,
  MapPin,
  RefreshCw,
  Wallet,
  Banknote,
  MoreVertical,
  Edit,
  Trash2,
  Eye,
} from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
import { StatusBadge } from "@/components/ui/status-badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useCurrency } from "@/hooks/use-currency"
import {
  countImportSuppliers,
  countSuppliersWithDebt,
  filterSuppliers,
  sumSupplierDebt,
  SUPPLIER_CURRENCIES,
  type SupplierDebtFilter,
  type SupplierTypeFilter,
} from "@/lib/supplier-utils"
import { getCurrencySelectLabel } from "@/lib/constants/currencies"
import { cn } from "@/lib/utils"
import { useClientPagination } from "@/hooks/use-client-pagination"
import { TablePagination } from "@/components/ui/table-pagination"
import { useTranslatedTableColumns } from "@/hooks/use-translated-table-columns"
import { TableColumnToggle } from "@/components/ui/table-column-toggle"
import { VisibleTableColumn } from "@/components/ui/visible-table-column"
import { TableListToolbar } from "@/components/ui/table-list-toolbar"
import { SUPPLIER_TABLE_COLUMNS } from "@/lib/table-column-presets"
import { useT } from "@/i18n/context"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SupplierDeleteDialog } from "@/components/suppliers/supplier-delete-dialog"
import { openDialogAfterMenuClose } from "@/lib/open-dialog-after-menu-close"

const SUPPLIER_COLUMN_LABEL_KEYS: Record<string, string> = {
  supplier: "suppliers.colSupplier",
  location: "suppliers.colLocation",
  type: "suppliers.colType",
  currency: "suppliers.colCurrency",
  debt: "suppliers.colDebt",
  actions: "suppliers.colActions",
}

const PAGE_SIZE = 50

export default function SuppliersPage() {
  const { formatAmount } = useCurrency()
  const t = useT()
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [typeFilter, setTypeFilter] = useState<SupplierTypeFilter>("all")
  const [currencyFilter, setCurrencyFilter] = useState<CurrencyCode | "all">("all")
  const [debtFilter, setDebtFilter] = useState<SupplierDebtFilter>("all")
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null)

  const loadSuppliers = async () => {
    setLoading(true)
    try {
      const data = await SupplierService.listSuppliers()
      setSuppliers(data)
    } catch {
      toast.error(t("suppliers.errorLoading"))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    const fetch = async () => {
      setLoading(true)
      try {
        const data = await SupplierService.listSuppliers()
        if (!cancelled) {
          setSuppliers(data)
        }
      } catch {
        if (!cancelled) toast.error(t("suppliers.errorLoading"))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetch()
    return () => {
      cancelled = true
    }
  }, [t])

  const filteredSuppliers = useMemo(
    () =>
      filterSuppliers(suppliers, {
        search: searchTerm,
        type: typeFilter,
        currency: currencyFilter,
        debt: debtFilter,
      }),
    [suppliers, searchTerm, typeFilter, currencyFilter, debtFilter]
  )

  const filterKey = `${searchTerm}|${typeFilter}|${currencyFilter}|${debtFilter}`
  const {
    paginatedItems: visibleSuppliers,
    page,
    setPage,
    totalPages,
    totalItems: filteredTotal,
    rangeStart,
    rangeEnd,
  } = useClientPagination(filteredSuppliers, { pageSize: PAGE_SIZE, resetKey: filterKey })

  const { isVisible, toggleColumn, resetColumns, columns: tableColumns } =
    useTranslatedTableColumns("suppliers", SUPPLIER_TABLE_COLUMNS, SUPPLIER_COLUMN_LABEL_KEYS)

  const stats = useMemo(
    () => ({
      total: suppliers.length,
      withDebt: countSuppliersWithDebt(suppliers),
      imports: countImportSuppliers(suppliers),
      totalDebt: sumSupplierDebt(suppliers),
    }),
    [suppliers]
  )

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Truck className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t("suppliers.title")}</h1>
            <p className="text-sm text-muted-foreground">
              {t("suppliers.subtitle")}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            className="rounded-xl font-semibold"
            onClick={loadSuppliers}
            disabled={loading}
          >
            <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
            {t("common.refresh")}
          </Button>
          <Button asChild className="rounded-xl font-semibold">
            <Link href="/suppliers/new">
              <Plus className="mr-2 h-4 w-4" />
              {t("entity.supplier.new")}
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="rounded-2xl border bg-card shadow-sm">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-900/50">
              <Truck className="h-5 w-5 text-slate-600 dark:text-slate-400" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {t("nav.suppliers")}
              </p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border bg-card shadow-sm">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-50 dark:bg-cyan-950/40">
              <Globe className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {t("suppliers.statImport")}
              </p>
              <p className="text-2xl font-bold">{stats.imports}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border bg-card shadow-sm">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-950/40">
              <Wallet className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {t("suppliers.statWithDebt")}
              </p>
              <p className="text-2xl font-bold">{stats.withDebt}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-2 rounded-2xl border bg-card shadow-sm lg:col-span-1">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Banknote className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {t("suppliers.statTotalDebt")}
              </p>
              <p className="text-sm font-bold">{formatAmount(stats.totalDebt)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border bg-card shadow-sm">
        <CardContent className="grid grid-cols-1 gap-3 p-4 md:grid-cols-4">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("suppliers.searchPlaceholder")}
              className="h-10 rounded-xl pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Select
            value={typeFilter}
            onValueChange={(v) => setTypeFilter(v as SupplierTypeFilter)}
          >
            <SelectTrigger className="h-10 rounded-xl">
              <SelectValue placeholder={t("suppliers.filterType")} />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="all">{t("suppliers.filterTypeAll")}</SelectItem>
              <SelectItem value="local">{t("badges.supplierType.local")}</SelectItem>
              <SelectItem value="import">{t("badges.supplierType.import")}</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={currencyFilter}
            onValueChange={(v) => setCurrencyFilter(v as CurrencyCode | "all")}
          >
            <SelectTrigger className="h-10 rounded-xl">
              <SelectValue placeholder={t("suppliers.filterCurrency")} />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="all">{t("suppliers.filterCurrencyAll")}</SelectItem>
              {SUPPLIER_CURRENCIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {getCurrencySelectLabel(c.value, t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={debtFilter}
            onValueChange={(v) => setDebtFilter(v as SupplierDebtFilter)}
          >
            <SelectTrigger className="h-10 rounded-xl">
              <SelectValue placeholder={t("suppliers.filterDebt")} />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="all">{t("suppliers.filterDebtAll")}</SelectItem>
              <SelectItem value="with_debt">{t("suppliers.filterDebtWith")}</SelectItem>
              <SelectItem value="clear">{t("suppliers.filterDebtClear")}</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <CardContent className="p-0">
          <TableListToolbar
            summary={
              !loading && filteredSuppliers.length > 0
                ? t("suppliers.countSummary", { count: filteredSuppliers.length })
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
          ) : filteredSuppliers.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 p-16 text-center">
              <Truck className="h-12 w-12 text-muted-foreground/30" />
              <div>
                <p className="font-semibold">{t("suppliers.noSuppliersFound")}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {suppliers.length === 0
                    ? t("suppliers.emptyStateDesc")
                    : t("suppliers.emptyStateFilterDesc")}
                </p>
              </div>
              {suppliers.length === 0 && (
                <Button asChild className="rounded-xl font-semibold">
                  <Link href="/suppliers/new">
                    <Plus className="mr-2 h-4 w-4" />
                    {t("entity.supplier.new")}
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <VisibleTableColumn id="supplier" isVisible={isVisible}>
                      <TableHead>{t("suppliers.colSupplier")}</TableHead>
                    </VisibleTableColumn>
                    <VisibleTableColumn id="location" isVisible={isVisible}>
                      <TableHead>{t("suppliers.colLocation")}</TableHead>
                    </VisibleTableColumn>
                    <VisibleTableColumn id="type" isVisible={isVisible}>
                      <TableHead>{t("suppliers.colType")}</TableHead>
                    </VisibleTableColumn>
                    <VisibleTableColumn id="currency" isVisible={isVisible}>
                      <TableHead>{t("suppliers.colCurrency")}</TableHead>
                    </VisibleTableColumn>
                    <VisibleTableColumn id="debt" isVisible={isVisible}>
                      <TableHead className="text-right">{t("suppliers.colDebt")}</TableHead>
                    </VisibleTableColumn>
                    <VisibleTableColumn id="actions" isVisible={isVisible}>
                      <TableHead className="text-right">{t("suppliers.colActions")}</TableHead>
                    </VisibleTableColumn>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleSuppliers.map((supplier) => (
                    <TableRow key={supplier.id} className="group">
                      <VisibleTableColumn id="supplier" isVisible={isVisible}>
                        <TableCell>
                          <Link
                            href={`/suppliers/${supplier.id}`}
                            className="flex items-center gap-3 rounded-lg transition-colors hover:bg-muted/40 -m-1 p-1"
                          >
                            <div
                              className={cn(
                                "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                                supplier.type === "import"
                                  ? "bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-400"
                                  : "bg-slate-100 text-slate-600 dark:bg-slate-900/50 dark:text-slate-400"
                              )}
                            >
                              {supplier.type === "import" ? (
                                <Globe className="h-4 w-4" />
                              ) : (
                                <Truck className="h-4 w-4" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold group-hover:text-primary">
                                {supplier.name}
                              </div>
                              <div className="flex items-center text-[10px] text-muted-foreground">
                                <Banknote className="mr-1 h-2.5 w-2.5 shrink-0" />
                                <span className="truncate">
                                  {supplier.paymentTerms || t("suppliers.defaultPaymentTerms")}
                                </span>
                              </div>
                            </div>
                          </Link>
                        </TableCell>
                      </VisibleTableColumn>
                      <VisibleTableColumn id="location" isVisible={isVisible}>
                        <TableCell>
                          <div className="flex items-center text-sm">
                            <MapPin className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                            {supplier.city && `${supplier.city}, `}
                            {supplier.country}
                          </div>
                        </TableCell>
                      </VisibleTableColumn>
                      <VisibleTableColumn id="type" isVisible={isVisible}>
                        <TableCell>
                          <StatusBadge
                            preset="supplierType"
                            value={supplier.type}
                            icon={
                              supplier.type === "import" ? (
                                <Globe className="h-3 w-3" />
                              ) : undefined
                            }
                            className="text-[10px]"
                          />
                        </TableCell>
                      </VisibleTableColumn>
                      <VisibleTableColumn id="currency" isVisible={isVisible}>
                        <TableCell>
                          <StatusBadge hashFromLabel className="font-mono text-[10px]">
                            {supplier.defaultCurrency}
                          </StatusBadge>
                        </TableCell>
                      </VisibleTableColumn>
                      <VisibleTableColumn id="debt" isVisible={isVisible}>
                        <TableCell className="text-right">
                          <span
                            className={cn(
                              "font-headline font-bold",
                              supplier.currentDebt > 0
                                ? "text-destructive"
                                : "text-emerald-600"
                            )}
                          >
                            {formatAmount(supplier.currentDebt)}
                          </span>
                        </TableCell>
                      </VisibleTableColumn>
                      <VisibleTableColumn id="actions" isVisible={isVisible}>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            {supplier.currentDebt > 0 && (
                              <Button
                                variant="outline"
                                size="sm"
                                asChild
                                className="hidden h-8 rounded-lg text-xs font-semibold sm:inline-flex"
                              >
                                <Link href={`/suppliers/${supplier.id}?tab=payments`}>
                                  <Wallet className="mr-1.5 h-3.5 w-3.5" />
                                  {t("suppliers.payBtn")}
                                </Link>
                              </Button>
                            )}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 rounded-lg"
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48 rounded-xl p-2">
                                <DropdownMenuItem asChild className="rounded-lg">
                                  <Link
                                    href={`/suppliers/${supplier.id}`}
                                    className="flex items-center gap-2"
                                  >
                                    <Eye className="h-4 w-4" />
                                    {t("suppliers.viewDetail")}
                                  </Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild className="rounded-lg">
                                  <Link
                                    href={`/suppliers/${supplier.id}/edit`}
                                    className="flex items-center gap-2 text-primary"
                                  >
                                    <Edit className="h-4 w-4" />
                                    {t("common.edit")}
                                  </Link>
                                </DropdownMenuItem>
                                {supplier.currentDebt > 0 && (
                                  <DropdownMenuItem asChild className="rounded-lg sm:hidden">
                                    <Link
                                      href={`/suppliers/${supplier.id}?tab=payments`}
                                      className="flex items-center gap-2"
                                    >
                                      <Wallet className="h-4 w-4" />
                                      {t("suppliers.payBtn")}
                                    </Link>
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="rounded-lg text-destructive focus:text-destructive"
                                  onSelect={() =>
                                    openDialogAfterMenuClose(() => setDeleteTarget(supplier))
                                  }
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  {t("common.delete")}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </VisibleTableColumn>
                    </TableRow>
                  ))}
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

      <SupplierDeleteDialog
        key={deleteTarget?.id ?? "closed"}
        supplier={deleteTarget}
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onDeleted={loadSuppliers}
      />
    </div>
  )
}
