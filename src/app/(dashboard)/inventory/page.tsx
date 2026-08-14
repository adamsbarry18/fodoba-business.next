
"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import { ProductService } from "@/services/product.service"
import { CategoryService } from "@/services/category.service"
import { Product, Category } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
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
  Edit,
  Package,
  Loader2,
  Eye,
  RefreshCw,
  History,
  AlertTriangle,
  Boxes,
  TrendingDown,
  MoreVertical,
  Trash2,
} from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
import { StatusBadge } from "@/components/ui/status-badge"
import { useStore } from "@/lib/contexts/StoreContext"
import { useAuth } from "@/lib/contexts/AuthContext"
import { useCurrency } from "@/hooks/use-currency"
import { usePermissions } from "@/hooks/use-permissions"
import { ProductDeleteDialog } from "@/components/inventory/product-delete-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Combobox } from "@/components/ui/combobox"
import { BarcodeScanField } from "@/components/barcode/barcode-scan-field"
import {
  countLowStock,
  countOutOfStock,
  estimateStockValue,
  filterProducts,
  getStockStatus,
  normalizeProduct,
  getProductUnitLabel,
  type StockFilter,
} from "@/lib/product-utils"
import { formatDecomposedStockLabel, type DecomposedStock } from "@/lib/stock-utils"
import { cn } from "@/lib/utils"
import { useTranslatedTableColumns } from "@/hooks/use-translated-table-columns"
import { TableColumnToggle } from "@/components/ui/table-column-toggle"
import { VisibleTableColumn } from "@/components/ui/visible-table-column"
import { INVENTORY_TABLE_COLUMNS } from "@/lib/table-column-presets"
import { useClientPagination } from "@/hooks/use-client-pagination"
import { TablePagination } from "@/components/ui/table-pagination"
import { useT, useLocale } from "@/i18n/context"
import { formatQuantity } from "@/lib/quantity-utils"
import { AppNotificationHelper } from "@/lib/notifications/app-notification-helper"
import { ProductExpirationDisplay } from "@/components/inventory/product-expiration-display"

const TABLE_PAGE_SIZE = 20

const INVENTORY_COLUMN_LABEL_KEYS: Record<string, string> = {
  product: "inventory.colProduct",
  sku: "inventory.colSku",
  category: "inventory.colCategory",
  price: "inventory.colPrice",
  expiration: "inventory.colExpiration",
  stock: "inventory.colStock",
  actions: "inventory.colActions",
}

export default function InventoryPage() {
  const router = useRouter()
  const { activeStore } = useStore()
  const { formatAmount } = useCurrency()
  const { isAdmin } = useAuth()
  const { can } = usePermissions()
  const t = useT()
  const { locale } = useLocale()

  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [stocks, setStocks] = useState<Record<string, DecomposedStock>>({})
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [filterCategory, setFilterCategory] = useState<string>("all")
  const [stockFilter, setStockFilter] = useState<StockFilter>("all")
  const [scanProcessing, setScanProcessing] = useState(false)
  const [productToDelete, setProductToDelete] = useState<Product | null>(null)

  const canManage = can("manage:catalog")
  const canDeleteProduct = isAdmin

  const { isVisible, toggleColumn, resetColumns, columns: tableColumns } =
    useTranslatedTableColumns("inventory", INVENTORY_TABLE_COLUMNS, INVENTORY_COLUMN_LABEL_KEYS)

  const storeId = activeStore?.id

  const loadCatalog = useCallback(async () => {
    if (!storeId) return
    setLoading(true)
    try {
      const [prodData, catData] = await Promise.all([
        ProductService.listAllProducts(),
        CategoryService.listCategories(),
      ])
      setProducts(prodData)
      setCategories(catData)
      const newStocks = await ProductService.getStockRecordsForProducts(
        prodData,
        storeId
      )
      setStocks(newStocks)
    } catch {
      toast.error(t("inventory.errorLoading"))
    } finally {
      setLoading(false)
    }
  }, [storeId, t])

  useEffect(() => {
    if (!storeId) {
      setProducts([])
      setStocks({})
      setLoading(false)
      return
    }
    void loadCatalog()
  }, [storeId, loadCatalog])

  useEffect(() => {
    if (products.length === 0) return
    void AppNotificationHelper.scanProductExpirations(products, storeId)
  }, [products, storeId])

  const stockQuantities = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(stocks).map(([id, record]) => [id, record.quantity])
      ),
    [stocks]
  )

  const filteredProducts = useMemo(
    () =>
      filterProducts(products, {
        search: searchTerm,
        categoryId: filterCategory,
        stockFilter,
        stocks: stockQuantities,
      }),
    [products, searchTerm, filterCategory, stockFilter, stockQuantities]
  )

  const filterKey = `${searchTerm}|${filterCategory}|${stockFilter}`
  const {
    paginatedItems: visibleProducts,
    page,
    setPage,
    totalPages,
    totalItems: filteredTotal,
    rangeStart,
    rangeEnd,
  } = useClientPagination(filteredProducts, {
    pageSize: TABLE_PAGE_SIZE,
    resetKey: filterKey,
  })

  const stats = useMemo(
    () => ({
      total: products.length,
      lowStock: countLowStock(products, stockQuantities),
      outOfStock: countOutOfStock(products, stockQuantities),
      valuation: estimateStockValue(products, stockQuantities),
    }),
    [products, stockQuantities]
  )

  const hasActiveFilters =
    searchTerm.trim().length > 0 ||
    filterCategory !== "all" ||
    stockFilter !== "all"

  const handleRefresh = async () => {
    await loadCatalog()
  }

  const handleProductScan = useCallback(
    async (code: string) => {
      setScanProcessing(true)
      try {
        const product = await ProductService.findProductByCode(code)
        if (!product) {
          toast.error(t("inventory.productNotFound", { code }))
          return
        }
        router.push(`/inventory/${product.id}`)
      } catch {
        toast.error(t("inventory.scanError"))
      } finally {
        setScanProcessing(false)
      }
    },
    [router, t]
  )

  if (!activeStore) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center text-muted-foreground">
        <Package className="h-10 w-10 opacity-30" />
        <p>{t("inventory.selectStore")}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Package className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t("inventory.title")}</h1>
            <p className="text-sm text-muted-foreground">
              {t.rich("inventory.subtitle", {
                store: activeStore.name,
                strong: (chunks) => (
                  <strong className="text-foreground">{chunks}</strong>
                ),
              })}
            </p>
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
            {t("inventory.refresh")}
          </Button>
          <Button variant="outline" asChild className="rounded-xl font-semibold">
            <Link href="/inventory/history">
              <History className="mr-2 h-4 w-4" />
              {t("inventory.history")}
            </Link>
          </Button>
          {canManage && (
            <Button asChild className="rounded-xl font-semibold">
              <Link href="/inventory/new">
                <Plus className="mr-2 h-4 w-4" />
                {t("inventory.newProduct")}
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="min-w-0 rounded-2xl border bg-card shadow-sm">
          <CardContent className="flex items-center gap-3 p-4 sm:gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-900/50">
              <Boxes className="h-5 w-5 text-slate-600 dark:text-slate-400" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {t("inventory.statTotal")}
              </p>
              <p className="truncate text-2xl font-bold">{stats.total}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0 rounded-2xl border bg-card shadow-sm">
          <CardContent className="flex items-center gap-3 p-4 sm:gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-950/40">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {t("inventory.statLowStock")}
              </p>
              <p className="truncate text-2xl font-bold">{stats.lowStock}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0 rounded-2xl border bg-card shadow-sm">
          <CardContent className="flex items-center gap-3 p-4 sm:gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 dark:bg-rose-950/40">
              <TrendingDown className="h-5 w-5 text-rose-600 dark:text-rose-400" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {t("inventory.statOutOfStock")}
              </p>
              <p className="truncate text-2xl font-bold">{stats.outOfStock}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0 rounded-2xl border bg-card shadow-sm">
          <CardContent className="flex items-center gap-3 p-4 sm:gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Package className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {t("inventory.statValuation")}
              </p>
              <p className="truncate text-sm font-bold">
                {formatAmount(stats.valuation)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border bg-card shadow-sm">
        <CardContent className="grid grid-cols-1 gap-3 p-4 md:grid-cols-4">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("inventory.searchPlaceholder")}
              className="h-10 rounded-xl pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Combobox
            value={filterCategory}
            onValueChange={setFilterCategory}
            placeholder={t("inventory.filterCategory")}
            searchPlaceholder={t("categories.searchPlaceholder")}
            options={[
              { value: "all", label: t("inventory.filterCategoryAll") },
              ...categories.map((cat) => ({
                value: cat.id,
                label: cat.name,
                keywords: [cat.name, cat.description],
              })),
            ]}
          />
          <Select
            value={stockFilter}
            onValueChange={(v) => setStockFilter(v as StockFilter)}
          >
            <SelectTrigger className="h-10 rounded-xl">
              <SelectValue placeholder={t("inventory.filterStock")} />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="all">{t("inventory.filterStockAll")}</SelectItem>
              <SelectItem value="low">{t("inventory.filterStockLow")}</SelectItem>
              <SelectItem value="out">{t("inventory.filterStockOut")}</SelectItem>
            </SelectContent>
          </Select>
          <div className="md:col-span-4">
            <BarcodeScanField
              placeholder={t("inventory.scanPlaceholderProduct")}
              onScan={handleProductScan}
              processing={scanProcessing}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/20 p-4 sm:p-6">
          <div>
            <CardTitle className="text-base">{t("inventory.listTitle")}</CardTitle>
            <CardDescription className="text-xs">
              {hasActiveFilters
                ? t("inventory.listDescriptionFiltered", { count: filteredTotal })
                : t("inventory.listDescription", { count: filteredTotal })}
            </CardDescription>
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
          ) : filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 p-16 text-center text-muted-foreground">
              <Package className="h-10 w-10 opacity-30" />
              <p className="font-medium">{t("inventory.noProductsFound")}</p>
              <p className="text-xs">
                {products.length === 0 && canManage
                  ? t("inventory.noProductsEmptyDesc")
                  : t("inventory.noProductsFilterDesc")}
              </p>
              {products.length === 0 && canManage && (
                <Button asChild className="mt-2 rounded-xl">
                  <Link href="/inventory/new">
                    <Plus className="mr-2 h-4 w-4" />
                    {t("inventory.newProduct")}
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <VisibleTableColumn id="product" isVisible={isVisible}>
                        <TableHead className="pl-4 sm:pl-6">{t("inventory.colProduct")}</TableHead>
                      </VisibleTableColumn>
                      <VisibleTableColumn id="sku" isVisible={isVisible}>
                        <TableHead>{t("inventory.colSku")}</TableHead>
                      </VisibleTableColumn>
                      <VisibleTableColumn id="category" isVisible={isVisible}>
                        <TableHead>{t("inventory.colCategory")}</TableHead>
                      </VisibleTableColumn>
                      <VisibleTableColumn id="price" isVisible={isVisible}>
                        <TableHead className="text-right">{t("inventory.colPrice")}</TableHead>
                      </VisibleTableColumn>
                      <VisibleTableColumn id="expiration" isVisible={isVisible}>
                        <TableHead>{t("inventory.colExpiration")}</TableHead>
                      </VisibleTableColumn>
                      <VisibleTableColumn id="stock" isVisible={isVisible}>
                        <TableHead className="text-center">{t("inventory.colStock")}</TableHead>
                      </VisibleTableColumn>
                      <VisibleTableColumn id="actions" isVisible={isVisible}>
                        <TableHead className="pr-4 text-right sm:pr-6">{t("inventory.colActions")}</TableHead>
                      </VisibleTableColumn>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleProducts.map((p) => {
                      const stockRecord = stocks[p.id] ?? {
                        packagingQty: 0,
                        detailQty: 0,
                        quantity: 0,
                      }
                      const stock = stockRecord.quantity
                      const status = getStockStatus(stock, p.lowStockThreshold)
                      const category = categories.find((c) => c.id === p.categoryId)?.name
                      const normalized = normalizeProduct(p)
                      const unitLabel = getProductUnitLabel(normalized.unit, t)
                      const packLabel = getProductUnitLabel(normalized.packagingUnit, t)
                      const hasPackaging =
                        !!normalized.packagingUnit && normalized.unitsPerPack > 1
                      const decomposedLabel = formatDecomposedStockLabel(
                        stockRecord,
                        p,
                        t("inventory.stockBreakdownSeparator"),
                        (unit) => getProductUnitLabel(unit, t)
                      )

                      return (
                        <TableRow
                          key={p.id}
                          className="transition-colors hover:bg-muted/20"
                        >
                          <VisibleTableColumn id="product" isVisible={isVisible}>
                            <TableCell className="pl-4 sm:pl-6">
                              <p className="text-sm font-semibold">{p.name}</p>
                              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                {unitLabel}
                                {normalized.packagingUnit && normalized.unitsPerPack > 1
                                  ? ` · ${t("inventory.detail.unitsPerPack", {
                                      count: normalized.unitsPerPack,
                                      unit: unitLabel,
                                      packaging: packLabel,
                                    })}`
                                  : ""}
                              </p>
                            </TableCell>
                          </VisibleTableColumn>
                          <VisibleTableColumn id="sku" isVisible={isVisible}>
                            <TableCell>
                              <p className="font-mono text-xs">{p.sku}</p>
                              {p.barcode && (
                                <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                                  {p.barcode}
                                </p>
                              )}
                            </TableCell>
                          </VisibleTableColumn>
                          <VisibleTableColumn id="category" isVisible={isVisible}>
                            <TableCell>
                              <StatusBadge hashFromLabel className="text-[10px]">
                                {category || "N/A"}
                              </StatusBadge>
                            </TableCell>
                          </VisibleTableColumn>
                          <VisibleTableColumn id="price" isVisible={isVisible}>
                            <TableCell className="text-right font-headline font-bold">
                              {formatAmount(p.sellingPriceFCFA ?? 0)}
                            </TableCell>
                          </VisibleTableColumn>
                          <VisibleTableColumn id="expiration" isVisible={isVisible}>
                            <TableCell>
                              <ProductExpirationDisplay expirationDate={p.expirationDate} />
                            </TableCell>
                          </VisibleTableColumn>
                          <VisibleTableColumn id="stock" isVisible={isVisible}>
                            <TableCell className="text-center">
                              <div className="flex flex-col items-center gap-1">
                                {hasPackaging ? (
                                  <>
                                    <span
                                      className={cn(
                                        "max-w-[140px] text-xs font-bold font-headline leading-tight sm:max-w-none sm:text-sm",
                                        status === "out" && "text-destructive",
                                        status === "low" && "text-amber-600",
                                        status === "ok" && "text-foreground"
                                      )}
                                    >
                                      {decomposedLabel}
                                    </span>
                                    <span className="text-[9px] text-muted-foreground">
                                      {t("inventory.stockTotalUnits", {
                                        count: formatQuantity(stock, locale),
                                        unit: unitLabel,
                                      })}
                                    </span>
                                  </>
                                ) : (
                                  <span
                                    className={cn(
                                      "text-base font-bold font-headline",
                                      status === "out" && "text-destructive",
                                      status === "low" && "text-amber-600",
                                      status === "ok" && "text-foreground"
                                    )}
                                  >
                                    {formatQuantity(stock, locale)}
                                  </span>
                                )}
                                {status === "low" && (
                                  <StatusBadge tone="warning" className="text-[8px]">
                                    {t("badges.stockStatus.low")}
                                  </StatusBadge>
                                )}
                                {status === "out" && (
                                  <StatusBadge tone="destructive" className="text-[8px]">
                                    {t("badges.stockStatus.out")}
                                  </StatusBadge>
                                )}
                              </div>
                            </TableCell>
                          </VisibleTableColumn>
                          <VisibleTableColumn id="actions" isVisible={isVisible}>
                            <TableCell className="pr-4 text-right sm:pr-6">
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
                              <DropdownMenuContent
                                align="end"
                                className="w-40 rounded-xl p-2"
                              >
                                <DropdownMenuItem asChild className="rounded-lg">
                                  <Link
                                    href={`/inventory/${p.id}`}
                                    className="flex items-center gap-2"
                                  >
                                    <Eye className="h-4 w-4" />
                                    {t("common.details")}
                                  </Link>
                                </DropdownMenuItem>
                                {canManage && (
                                  <DropdownMenuItem asChild className="rounded-lg">
                                    <Link
                                      href={`/inventory/${p.id}/edit`}
                                      className="flex items-center gap-2 text-primary"
                                    >
                                      <Edit className="h-4 w-4" />
                                      {t("inventory.edit")}
                                    </Link>
                                  </DropdownMenuItem>
                                )}
                                {canDeleteProduct && (
                                  <DropdownMenuItem
                                    className="flex items-center gap-2 rounded-lg text-destructive focus:text-destructive"
                                    onSelect={() => setProductToDelete(p)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    {t("common.delete")}
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                          </VisibleTableColumn>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

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

      <ProductDeleteDialog
        product={productToDelete}
        open={Boolean(productToDelete)}
        onOpenChange={(open) => {
          if (!open) setProductToDelete(null)
        }}
        onDeleted={() => {
          void loadCatalog()
        }}
      />
    </div>
  )
}
