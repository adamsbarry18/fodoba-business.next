"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { DocumentSnapshot } from "firebase/firestore"
import { ProductService } from "@/services/product.service"
import { ClientService } from "@/services/client.service"
import { SaleService } from "@/services/sale.service"
import { CategoryService } from "@/services/category.service"
import { CashService } from "@/services/cash.service"
import { Product, Client, SaleItem, Category, CashSession, PriceTier } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { StatusBadge } from "@/components/ui/status-badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { 
  Search, 
  ShoppingCart, 
  Trash2, 
  Plus, 
  Minus, 
  Loader2,
  LayoutGrid,
  List,
  User,
  Barcode,
  Keyboard,
  Percent,
  Tag,
  Store,
  RefreshCw,
  PencilLine,
} from "lucide-react"
import { toast } from "sonner"
import { useStore } from "@/lib/contexts/StoreContext"
import { useAuth } from "@/lib/contexts/AuthContext"
import { cashSessionStatusBadgeValue } from "@/lib/cash-session-utils"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { PosClientPicker } from "@/components/pos/pos-client-picker"
import { BarcodeScanField } from "@/components/barcode/barcode-scan-field"
import { useGlobalBarcodeListener } from "@/hooks/use-barcode-scanner"
import { applyReturnSelection } from "@/hooks/use-return-selection"
import { ENTITY_ROUTES } from "@/lib/navigation/return-to"
import Link from "next/link"
import { useCurrency } from "@/hooks/use-currency"
import {
  applyCartDiscount,
  buildSaleItemFromProduct,
  convertCartQuantityForTierChange,
  getCartItemCount,
  getCartLineKey,
  getCartSubtotal,
  getProductPriceForTier,
  hasWholesalePrice,
  syncSaleItemQuantities,
} from "@/lib/pos-utils"
import { normalizeProduct, getProductUnitLabel, getStockStatus } from "@/lib/product-utils"
import {
  formatDecomposedStockLabel,
  type DecomposedStock,
} from "@/lib/stock-utils"
import { useClientPagination } from "@/hooks/use-client-pagination"
import { TablePagination } from "@/components/ui/table-pagination"
import { useT } from "@/i18n/context"
import { DecimalInput } from "@/components/ui/decimal-input"
import { isQuantityAtLeast, roundQuantity } from "@/lib/quantity-utils"
import {
  loadPosCheckoutDraft,
  savePosCheckoutDraft,
} from "@/lib/pos-checkout-draft"

const POS_FETCH_SIZE = 48
const POS_PAGE_SIZE = 12

export default function POSPage() {
  const { activeStore } = useStore()
  const { userProfile } = useAuth()
  const { formatAmount } = useCurrency()
  const t = useT()
  const formatUnit = (unit?: string) => getProductUnitLabel(unit, t)
  const searchParams = useSearchParams()
  const router = useRouter()
  const correctSaleIdParam = searchParams.get("correctSaleId")
  
  // Product & Category Data
  const [products, setProducts] = useState<Product[]>([])
  const [stocks, setStocks] = useState<Record<string, DecomposedStock>>({})
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("all")
  
  const [lastVisible, setLastVisible] = useState<DocumentSnapshot | undefined>(undefined)
  const [hasMore, setHasMore] = useState(true)
  const [catalogTotalCount, setCatalogTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  
  const [clients, setClients] = useState<Client[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [cart, setCart] = useState<SaleItem[]>([])
  const [correctingSaleId, setCorrectingSaleId] = useState<string | null>(null)
  const [correctingSaleRef, setCorrectingSaleRef] = useState<string | null>(null)
  const preloadDoneRef = useRef<string | null>(null)
  
  // Customer autocomplete states
  const [selectedClientId, setSelectedClientId] = useState<string>("none")
  const [draftHydrated, setDraftHydrated] = useState(false)
  
  const [discount, setDiscount] = useState<number>(0)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  
  // Barcode scan
  const [scanProcessing, setScanProcessing] = useState(false)
  const [cashSession, setCashSession] = useState<CashSession | null>(null)

  const storeId = activeStore?.id

  const loadStocksForProducts = useCallback(
    async (productList: Product[], merge = false) => {
      if (!storeId || productList.length === 0) {
        if (!merge) setStocks({})
        return
      }
      try {
        const records = await ProductService.getStockRecordsForProducts(
          productList,
          storeId
        )
        setStocks((prev) => (merge ? { ...prev, ...records } : records))
      } catch {
        // Stock display is non-blocking for POS
      }
    },
    [storeId]
  )

  // Success states
  useEffect(() => {
    const loadInitialData = async () => {
      setLoading(true)
      try {
        const catalogFilters = { active: true as const }
        const [prodResult, catalogCount, clientResult, categoriesResult] =
          await Promise.all([
            ProductService.listProducts(catalogFilters, POS_FETCH_SIZE),
            ProductService.countProducts(catalogFilters),
            ClientService.listClients(),
            CategoryService.listCategories(),
          ])
        setProducts(prodResult.products)
        setLastVisible(prodResult.lastVisible)
        setHasMore(prodResult.products.length === POS_FETCH_SIZE)
        setCatalogTotalCount(catalogCount)
        setClients(clientResult)
        setCategories(categoriesResult)
        if (storeId) {
          void loadStocksForProducts(prodResult.products)
        }

        await applyReturnSelection(
          ENTITY_ROUTES.client.param,
          (id) => {
            setSelectedClientId(id)
          },
          {
            successMessage: t(ENTITY_ROUTES.client.createdMessageKey),
            errorMessage: t("hooks.returnSelectionError"),
            reload: async () => {
              const fresh = await ClientService.listClients()
              setClients(fresh)
            },
          }
        )
      } catch {
        toast.error(t("pos.errorLoadingData"))
      } finally {
        setLoading(false)
      }
    }
    void loadInitialData()
  }, [storeId, loadStocksForProducts, t])

  useEffect(() => {
    if (!activeStore?.id) {
      setCashSession(null)
      return
    }
    CashService.getActiveSession(activeStore.id)
      .then(setCashSession)
      .catch(() => setCashSession(null))
  }, [activeStore?.id])

  useEffect(() => {
    if (!activeStore?.id) return
    if (!correctSaleIdParam) {
      const stored = loadPosCheckoutDraft()
      if (stored && stored.storeId === activeStore.id && stored.cart.length > 0) {
        setCart(stored.cart)
        setDiscount(stored.discount)
        setSelectedClientId(stored.selectedClientId || "none")
        setCorrectingSaleId(stored.correctingSaleId)
        setCorrectingSaleRef(stored.correctingSaleRef)
      }
    }
    setDraftHydrated(true)
  }, [activeStore?.id, correctSaleIdParam])

  useEffect(() => {
    if (!draftHydrated || !activeStore?.id) return
    savePosCheckoutDraft({
      storeId: activeStore.id,
      cart,
      discount,
      selectedClientId,
      correctingSaleId,
      correctingSaleRef,
    })
  }, [
    draftHydrated,
    activeStore?.id,
    cart,
    discount,
    selectedClientId,
    correctingSaleId,
    correctingSaleRef,
  ])

  // Préchargement panier pour correction de vente
  useEffect(() => {
    if (!correctSaleIdParam || !activeStore || loading) return
    if (preloadDoneRef.current === correctSaleIdParam) return

    const preload = async () => {
      try {
        const sale = await SaleService.getSale(correctSaleIdParam)
        if (!sale) {
          toast.error(t("pos.correctSaleNotFound"))
          router.replace("/pos")
          return
        }
        if (sale.storeId !== activeStore.id) {
          toast.error(t("pos.correctSaleWrongStore"))
          router.replace("/pos")
          return
        }
        if (sale.status !== "COMPLETED") {
          toast.error(t("pos.correctSaleNotEditable"))
          router.replace("/pos")
          return
        }

        setCart(sale.items.map((item) => ({ ...item })))
        setDiscount(sale.discount || 0)
        if (sale.clientId) {
          setSelectedClientId(sale.clientId)
        } else {
          setSelectedClientId("none")
        }
        setCorrectingSaleId(sale.id)
        setCorrectingSaleRef(sale.id.slice(-6).toUpperCase())
        preloadDoneRef.current = correctSaleIdParam
        toast.message(t("pos.correctSaleLoaded", { ref: sale.id.slice(-6).toUpperCase() }))
      } catch {
        toast.error(t("pos.correctSaleLoadError"))
        router.replace("/pos")
      }
    }

    void preload()
  }, [correctSaleIdParam, activeStore, loading, clients, router, t])

  const clearCorrectionMode = useCallback(() => {
    setCorrectingSaleId(null)
    setCorrectingSaleRef(null)
    preloadDoneRef.current = null
    if (correctSaleIdParam) {
      router.replace("/pos")
    }
  }, [correctSaleIdParam, router])

  // Refs pour pagination : évite de recréer loadProductsByCategory à chaque fetch
  // (sinon l'effet search relance le chargement en boucle → spinner infini).
  const lastVisibleRef = useRef(lastVisible)
  const hasMoreRef = useRef(hasMore)
  const loadingMoreRef = useRef(loadingMore)
  const productsRef = useRef(products)
  const prevSearchTermRef = useRef(searchTerm)

  useEffect(() => {
    lastVisibleRef.current = lastVisible
  }, [lastVisible])
  useEffect(() => {
    hasMoreRef.current = hasMore
  }, [hasMore])
  useEffect(() => {
    loadingMoreRef.current = loadingMore
  }, [loadingMore])
  useEffect(() => {
    productsRef.current = products
  }, [products])

  const buildCatalogFilters = useCallback((categoryId: string) => {
    return {
      active: true as const,
      categoryId: categoryId === "all" ? undefined : categoryId,
    }
  }, [])

  const loadProductsByCategory = useCallback(async (categoryId: string, isLoadMore = false) => {
    if (isLoadMore) {
      if (loadingMoreRef.current || !hasMoreRef.current) return
      setLoadingMore(true)
    } else {
      setLoading(true)
    }

    try {
      const filters = buildCatalogFilters(categoryId)

      const [result, totalCount] = await Promise.all([
        ProductService.listProducts(
          filters,
          POS_FETCH_SIZE,
          isLoadMore ? lastVisibleRef.current : undefined
        ),
        isLoadMore
          ? Promise.resolve(null)
          : ProductService.countProducts(filters),
      ])

      if (isLoadMore) {
        setProducts((prev) => {
          const next = [...prev, ...result.products]
          productsRef.current = next
          return next
        })
        void loadStocksForProducts(result.products, true)
      } else {
        setProducts(result.products)
        productsRef.current = result.products
        void loadStocksForProducts(result.products)
        if (typeof totalCount === "number") {
          setCatalogTotalCount(totalCount)
        }
      }

      setLastVisible(result.lastVisible)
      setHasMore(result.products.length === POS_FETCH_SIZE)
    } catch {
      toast.error(t("pos.errorLoadingItems"))
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [buildCatalogFilters, loadStocksForProducts, t])

  // Handle Category Selection
  const handleCategoryChange = (categoryId: string) => {
    setSelectedCategoryId(categoryId)
    // Évite un double fetch via l'effet search (clear → reload catégorie)
    prevSearchTermRef.current = ""
    setSearchTerm("")
    void loadProductsByCategory(categoryId)
  }

  // Recherche Firestore debouncée ; reload catégorie uniquement quand on efface la recherche
  useEffect(() => {
    const prevSearch = prevSearchTermRef.current
    prevSearchTermRef.current = searchTerm

    if (!searchTerm.trim()) {
      if (prevSearch.trim()) {
        void loadProductsByCategory(selectedCategoryId)
      }
      return
    }

    const searchDebounce = setTimeout(async () => {
      setLoadingMore(true)
      try {
        const searchResults = await ProductService.searchProducts(searchTerm)
        setProducts(searchResults)
        productsRef.current = searchResults
        setHasMore(false)
        setCatalogTotalCount(searchResults.length)
        void loadStocksForProducts(searchResults)
      } catch {
        toast.error(t("pos.errorSearch"))
      } finally {
        setLoadingMore(false)
      }
    }, 450)

    return () => clearTimeout(searchDebounce)
  }, [searchTerm, selectedCategoryId, loadProductsByCategory, loadStocksForProducts, t])

  // Barcode / douchette / caméra
  const addToCart = useCallback((product: Product, tier: PriceTier = "retail") => {
    setCart(prev => {
      const existing = prev.find(
        item => item.productId === product.id && (item.priceTier ?? "retail") === tier
      )
      if (existing) {
        return prev.map(item =>
          item.productId === product.id && (item.priceTier ?? "retail") === tier
            ? syncSaleItemQuantities(
                { ...item, quantity: item.quantity + 1 },
                product
              )
            : item
        )
      }
      return [...prev, buildSaleItemFromProduct(product, tier, 1)]
    })
  }, [])

  const handlePriceTierChange = (
    productId: string,
    currentTier: PriceTier,
    newTier: PriceTier
  ) => {
    if (currentTier === newTier) return
    setCart(prev => {
      const lineIndex = prev.findIndex(
        item => item.productId === productId && (item.priceTier ?? "retail") === currentTier
      )
      if (lineIndex === -1) return prev

      const item = prev[lineIndex]
      const product = products.find(p => p.id === productId)
      if (!product) return prev

      const targetIndex = prev.findIndex(
        i => i.productId === productId && (i.priceTier ?? "retail") === newTier
      )

      if (targetIndex !== -1 && targetIndex !== lineIndex) {
        const convertedQty = convertCartQuantityForTierChange(item.quantity)
        const mergedQty = roundQuantity(prev[targetIndex].quantity + convertedQty)
        return prev
          .filter((_, i) => i !== lineIndex)
          .map(i =>
            i.productId === productId && (i.priceTier ?? "retail") === newTier
              ? syncSaleItemQuantities(
                  {
                    ...i,
                    quantity: mergedQty,
                    unitPrice: getProductPriceForTier(product, newTier),
                  },
                  product
                )
              : i
          )
      }

      const convertedQty = convertCartQuantityForTierChange(item.quantity)
      const unitPrice = getProductPriceForTier(product, newTier)
      return prev.map((i, idx) =>
        idx === lineIndex
          ? syncSaleItemQuantities(
              { ...i, priceTier: newTier, unitPrice, quantity: convertedQty },
              product
            )
          : i
      )
    })
  }

  const handleProductScan = useCallback(async (code: string) => {
    setScanProcessing(true)
    try {
      const product = await ProductService.findProductByCode(code)
      if (!product) {
        toast.error(t("pos.productNotFound", { code }))
        return
      }
      addToCart(product)
      toast.success(t("pos.productAdded", { name: product.name }), {
        duration: 1500,
        position: "bottom-center",
      })
    } catch {
      toast.error(t("pos.errorScan"))
    } finally {
      setScanProcessing(false)
    }
  }, [addToCart, t])

  useGlobalBarcodeListener(handleProductScan)

  const updateQty = (lineKey: string, delta: number) => {
    setCart(prev => prev.map(item => {
      const key = getCartLineKey(item.productId, item.priceTier ?? "retail")
      if (key !== lineKey) return item

      const product = products.find(p => p.id === item.productId)
      const newQty = roundQuantity(Math.max(0, item.quantity + delta))
      if (!product) {
        return { ...item, quantity: newQty, total: newQty * item.unitPrice }
      }
      return syncSaleItemQuantities({ ...item, quantity: newQty }, product)
    }).filter(item => item.quantity > 0))
  }

  const clearQty = (lineKey: string) => {
    setCart((prev) =>
      prev.map((item) => {
        const key = getCartLineKey(item.productId, item.priceTier ?? "retail")
        if (key !== lineKey) return item
        return { ...item, quantity: 0, retailQuantity: 0, total: 0 }
      })
    )
  }

  const setQtyValue = (lineKey: string, rawQty: number) => {
    const newQty = roundQuantity(Math.max(0, rawQty))

    setCart((prev) =>
      prev.map((item) => {
        const key = getCartLineKey(item.productId, item.priceTier ?? "retail")
        if (key !== lineKey) return item

        const product = products.find((p) => p.id === item.productId)
        if (!product) {
          return { ...item, quantity: newQty, total: newQty * item.unitPrice }
        }
        return syncSaleItemQuantities({ ...item, quantity: newQty }, product)
      })
    )
  }

  const commitQty = (lineKey: string) => {
    setCart((prev) => prev.filter((item) => {
      const key = getCartLineKey(item.productId, item.priceTier ?? "retail")
      if (key !== lineKey) return true
      return item.quantity > 0
    }))
  }

  // Direct Inline Price Edit
  const handlePriceEdit = (lineKey: string, newPrice: number) => {
    setCart(prev => prev.map(item => {
      const key = getCartLineKey(item.productId, item.priceTier ?? "retail")
      return key === lineKey
        ? { ...item, unitPrice: newPrice, total: item.quantity * newPrice }
        : item
    }))
  }

  const subtotal = getCartSubtotal(cart)
  const total = applyCartDiscount(subtotal, discount)
  const cartItemCount = getCartItemCount(cart)

  const handleOpenPayment = () => {
    if (!cashSession) {
      toast.error(t("pos.openCashFirst"))
      return
    }
    if (!activeStore || cart.length === 0) return
    savePosCheckoutDraft({
      storeId: activeStore.id,
      cart,
      discount,
      selectedClientId,
      correctingSaleId,
      correctingSaleRef,
    })
    router.push("/pos/checkout")
  }

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === selectedClientId),
    [clients, selectedClientId]
  )

  const catalogResetKey = `${selectedCategoryId}|${searchTerm.trim()}`
  const {
    paginatedItems: visibleProducts,
    page: catalogPage,
    setPage: setCatalogPage,
    totalPages: catalogTotalPages,
    totalItems: catalogTotalItems,
    rangeStart: catalogRangeStart,
    rangeEnd: catalogRangeEnd,
  } = useClientPagination(products, {
    pageSize: POS_PAGE_SIZE,
    resetKey: catalogResetKey,
    totalCount: catalogTotalCount,
  })

  /** Charge le buffer jusqu’à la page demandée, puis navigue (total pages réel). */
  const handleCatalogPageChange = useCallback(
    async (nextPage: number) => {
      if (nextPage < 1 || nextPage > catalogTotalPages) return

      if (!searchTerm.trim()) {
        const needed = nextPage * POS_PAGE_SIZE
        while (productsRef.current.length < needed && hasMoreRef.current) {
          const before = productsRef.current.length
          await loadProductsByCategory(selectedCategoryId, true)
          if (productsRef.current.length <= before) break
        }
      }

      setCatalogPage(nextPage)
    },
    [
      catalogTotalPages,
      loadProductsByCategory,
      searchTerm,
      selectedCategoryId,
      setCatalogPage,
    ]
  )

  const refreshCashSession = () => {
    if (!activeStore?.id) return
    CashService.getActiveSession(activeStore.id)
      .then(setCashSession)
      .catch(() => setCashSession(null))
  }


  return (
    <div className="mx-auto max-w-[1600px] space-y-6 pb-8">
      <div className="flex flex-col gap-4 rounded-2xl border bg-card p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Store className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{t("pos.title")}</h1>
              <StatusBadge tone="primary-soft" className="text-[10px]">
                {activeStore?.name || t("pos.store")}
              </StatusBadge>
              <StatusBadge
                preset="cashSessionStatus"
                value={cashSessionStatusBadgeValue(cashSession)}
                className="text-[9px] uppercase"
              />
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <User className="h-3.5 w-3.5" />
              {t("pos.cashier")} : {userProfile?.firstName} {userProfile?.lastName}
              {cashSession?.openedByName
                ? ` · ${t("pos.sharedDrawerOpen", { name: cashSession.openedByName })}`
                : ""}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="hidden items-center gap-1.5 rounded-xl border bg-muted/30 px-3 py-2 text-xs text-muted-foreground sm:flex">
            <Keyboard className="h-3.5 w-3.5" />
            <span>
              {t("pos.scannerOrKey")} <kbd className="rounded border bg-background px-1.5 py-0.5 text-[10px]">F2</kbd>
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl"
            onClick={refreshCashSession}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            {t("pos.cashRegister")}
          </Button>
        </div>
      </div>

      {!cashSession && (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-bold text-foreground">{t("pos.cashClosed")}</p>
            <p className="text-xs text-muted-foreground">
              {t("pos.cashClosedDesc")}
            </p>
          </div>
          <Button asChild variant="outline" className="shrink-0 rounded-xl font-bold">
            <Link href="/reconciliation">{t("pos.openCash")}</Link>
          </Button>
        </div>
      )}

      {correctingSaleId && correctingSaleRef && (
        <div className="flex flex-col gap-3 rounded-2xl border border-sky-500/25 bg-sky-500/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-xl bg-sky-500/10 p-2 text-sky-700 dark:text-sky-300">
              <PencilLine className="h-4 w-4" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold text-foreground">
                {t("pos.correctSaleBannerTitle", { ref: correctingSaleRef })}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("pos.correctSaleBannerDesc")}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            className="shrink-0 rounded-xl font-bold"
            onClick={() => {
              setCart([])
              setDiscount(0)
              setSelectedClientId("none")
              clearCorrectionMode()
              toast.message(t("pos.correctSaleCancelled"))
            }}
          >
            {t("pos.correctSaleAbort")}
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column: Product Area (8/12 grid) */}
        <div className="lg:col-span-8 space-y-5">
          
          {/* Controls: Search, Scanner Simulation & View toggle */}
          <div className="flex flex-col sm:flex-row gap-3 bg-muted/20 p-3 rounded-2xl border border-border">
            
            {/* Standard Hybrid Search Bar */}
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder={t("pos.searchPlaceholder")} 
                className="pl-10 h-10 w-full bg-background border-border rounded-xl text-xs focus-visible:ring-primary/20"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <BarcodeScanField
              className="flex-1"
              placeholder={t("pos.scanPlaceholder")}
              onScan={handleProductScan}
              processing={scanProcessing}
              onFocusHint={() => toast.info(t("pos.scanReady"), { duration: 1500 })}
            />

            {/* View Mode Grid/List toggle */}
            <div className="flex items-center gap-1.5 bg-background p-1 border border-border rounded-xl h-10 self-end">
              <Button 
                variant="ghost" 
                size="icon" 
                className={cn("h-8 w-8 rounded-lg", viewMode === 'grid' && "bg-secondary text-foreground")}
                onClick={() => setViewMode('grid')}
                title={t("pos.gridView")}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                className={cn("h-8 w-8 rounded-lg", viewMode === 'list' && "bg-secondary text-foreground")}
                onClick={() => setViewMode('list')}
                title={t("pos.listView")}
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Horizontally scrollable category pills */}
          <div className="relative">
            <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
              <button
                onClick={() => handleCategoryChange("all")}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 flex-shrink-0 border",
                  selectedCategoryId === "all"
                    ? "bg-primary text-white border-primary shadow-sm"
                    : "bg-card text-muted-foreground border-border hover:text-foreground hover:bg-muted"
                )}
              >
                <Tag className="w-3.5 h-3.5" />
                <span>{t("pos.allItems")}</span>
              </button>
              
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => handleCategoryChange(cat.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 flex-shrink-0 border",
                    selectedCategoryId === cat.id
                      ? "bg-primary text-white border-primary shadow-sm"
                      : "bg-card text-muted-foreground border-border hover:text-foreground hover:bg-muted"
                  )}
                >
                  <span>{cat.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Loader or Grid/List catalogs layout */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-xs text-muted-foreground font-medium">{t("pos.loadingCatalog")}</p>
            </div>
          ) : products.length > 0 ? (
            <>
              {viewMode === 'grid' ? (
                /* 1. Grid Visual Mode */
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {visibleProducts.map((product) => {
                    const stockRecord = stocks[product.id] ?? {
                      packagingQty: 0,
                      detailQty: 0,
                      quantity: 0,
                    }
                    const stockStatus = getStockStatus(
                      stockRecord.quantity,
                      product.lowStockThreshold
                    )
                    const stockLabel = formatDecomposedStockLabel(
                      stockRecord,
                      product,
                      t("inventory.stockBreakdownSeparator"),
                      formatUnit
                    )

                    return (
                    <Card 
                      key={product.id} 
                      className="cursor-pointer hover:border-primary/20 hover:shadow-md transition-all shadow-sm border bg-card rounded-2xl overflow-hidden group relative flex flex-col justify-between"
                      onClick={() => addToCart(product)}
                    >
                      <div className="p-5 space-y-3.5">
                        <div className="flex items-center justify-between">
                          <Badge variant="secondary" className="bg-secondary/60 text-muted-foreground border-none font-bold px-2 py-0.5 rounded-md text-[9px] uppercase tracking-wider">
                            {formatUnit(product.unit)}
                          </Badge>
                          <span className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest">
                            SKU: {product.sku}
                          </span>
                        </div>
                        
                        <p className="font-bold text-xs leading-snug line-clamp-2 min-h-[36px] text-foreground group-hover:text-primary transition-colors">
                          {product.name}
                        </p>

                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                            {t("pos.availableStock")}
                          </span>
                          <span
                            className={cn(
                              "text-[10px] font-bold text-right leading-tight",
                              stockStatus === "out" && "text-destructive",
                              stockStatus === "low" && "text-amber-600",
                              stockStatus === "ok" && "text-foreground"
                            )}
                          >
                            {stockLabel}
                          </span>
                        </div>

                        <div className="flex items-end justify-between pt-1">
                          <div className="space-y-0.5">
                            <span className="text-[9px] text-muted-foreground uppercase font-bold tracking-wider">{t("pos.sellingPrice")}</span>
                            <div className="text-primary font-extrabold text-base font-headline">
                              {formatAmount(product.sellingPriceFCFA)}
                            </div>
                            {hasWholesalePrice(product) && (
                              <p className="text-[9px] text-muted-foreground">
                                {t("pos.wholesalePricePerPack", {
                                  price: formatAmount(getProductPriceForTier(product, "wholesale")),
                                  unit:
                                    formatUnit(normalizeProduct(product).packagingUnit) ||
                                    t("inventory.form.packagingFallback"),
                                })}
                              </p>
                            )}
                          </div>
                          <div className="bg-primary/10 p-2 rounded-xl text-primary group-hover:bg-primary group-hover:text-white transition-all duration-200 active:scale-90">
                            <Plus className="w-4 h-4" />
                          </div>
                        </div>
                      </div>
                    </Card>
                    )
                  })}
                </div>
              ) : (
                /* 2. Compact Dense List Mode (SaaS Spreadsheet UI) */
                <Card className="border bg-card rounded-2xl shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-border bg-muted/40 text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                          <th className="py-3 px-5">{t("pos.refSku")}</th>
                          <th className="py-3 px-5">{t("pos.itemName")}</th>
                          <th className="py-3 px-5">{t("common.unit")}</th>
                          <th className="py-3 px-5 text-right">{t("pos.availableStock")}</th>
                          <th className="py-3 px-5 text-right">{t("pos.priceFcfa")}</th>
                          <th className="py-3 px-5 text-center">{t("pos.action")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border text-xs">
                        {visibleProducts.map((product) => {
                          const stockRecord = stocks[product.id] ?? {
                            packagingQty: 0,
                            detailQty: 0,
                            quantity: 0,
                          }
                          const stockStatus = getStockStatus(
                            stockRecord.quantity,
                            product.lowStockThreshold
                          )
                          const stockLabel = formatDecomposedStockLabel(
                            stockRecord,
                            product,
                            t("inventory.stockBreakdownSeparator"),
                            formatUnit
                          )

                          return (
                          <tr 
                            key={product.id}
                            className="group hover:bg-muted/30 transition-colors duration-150 cursor-pointer"
                            onClick={() => addToCart(product)}
                          >
                            <td className="py-2.5 px-5 font-mono text-[10px] text-muted-foreground">{product.sku}</td>
                            <td className="py-2.5 px-5 font-bold text-foreground group-hover:text-primary transition-colors">{product.name}</td>
                            <td className="py-2.5 px-5">
                              <StatusBadge tone="slate" className="text-[9px] font-bold uppercase">
                                {formatUnit(product.unit)}
                              </StatusBadge>
                            </td>
                            <td
                              className={cn(
                                "py-2.5 px-5 text-right text-[10px] font-bold",
                                stockStatus === "out" && "text-destructive",
                                stockStatus === "low" && "text-amber-600",
                                stockStatus === "ok" && "text-foreground"
                              )}
                            >
                              {stockLabel}
                            </td>
                            <td className="py-2.5 px-5 text-right font-bold text-foreground">
                              <div>{formatAmount(product.sellingPriceFCFA)}</div>
                              {hasWholesalePrice(product) && (
                                <div className="text-[9px] font-normal text-muted-foreground">
                                  {t("pos.wholesalePricePerPack", {
                                    price: formatAmount(getProductPriceForTier(product, "wholesale")),
                                    unit:
                                      formatUnit(normalizeProduct(product).packagingUnit) ||
                                      t("inventory.form.packagingFallback"),
                                  })}
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 px-5 text-center">
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                className="h-7 px-2 bg-primary/5 hover:bg-primary hover:text-white text-primary text-[10px] font-bold rounded-lg"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  addToCart(product)
                                }}
                              >
                                <Plus className="w-3 h-3 mr-1" /> {t("pos.addToCart")}
                              </Button>
                            </td>
                          </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}

              <TablePagination
                page={catalogPage}
                totalPages={catalogTotalPages}
                totalItems={catalogTotalItems}
                rangeStart={catalogRangeStart}
                rangeEnd={catalogRangeEnd}
                onPageChange={(page) => {
                  void handleCatalogPageChange(page)
                }}
                loadingMore={loadingMore}
                className="rounded-2xl border bg-card"
              />
            </>
          ) : (
            /* Empty State */
            <div className="text-center py-16 bg-card border-2 border-dashed border-border rounded-2xl max-w-md mx-auto space-y-4">
              <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center border border-border">
                <Barcode className="w-5 h-5 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-foreground">{t("pos.noItems")}</h3>
                <p className="text-xs text-muted-foreground max-w-[280px] mx-auto">
                  {t("pos.noItemsDesc")}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Checkout Cart & Client Selection (4/12 grid) */}
        <div className="lg:col-span-4 sticky top-6">
          <Card className="border bg-card shadow-sm rounded-2xl overflow-hidden flex flex-col justify-between">
            <div>
              {/* Cart Header */}
              <CardHeader className="border-b border-border p-5 pb-4 flex flex-row items-center justify-between space-y-0">
                <div className="flex items-center gap-2">
                  <div className="bg-secondary p-2 rounded-xl text-muted-foreground">
                    <ShoppingCart className="w-4 h-4" />
                  </div>
                  <CardTitle className="text-sm font-bold text-foreground">{t("pos.activeCart")}</CardTitle>
                </div>
                <Badge variant="secondary" className="bg-primary/10 text-primary font-bold rounded-full px-2.5 py-0.5 text-[10px]">
                  {t("pos.itemCount", { count: cartItemCount })}
                </Badge>
              </CardHeader>

              <CardContent className="p-0">
                {/* Client de facturation - passage par défaut */}
                <div className="space-y-2 border-b border-border p-5">
                  <Label className="ml-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {t("pos.billingClient")}
                  </Label>
                  <PosClientPicker
                    clients={clients}
                    selectedClientId={selectedClientId}
                    selectedClient={selectedClient}
                    onSelect={setSelectedClientId}
                    returnTo="/pos"
                  />
                </div>

                {/* Cart Items List Area */}
                <ScrollArea className="h-[320px] p-3">
                  {cart.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
                      <div className="rounded-full bg-muted p-3.5 text-muted-foreground/40">
                        <ShoppingCart className="h-6 w-6" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-foreground">{t("pos.emptyCart")}</p>
                        <p className="max-w-[200px] text-[10px] text-muted-foreground">
                          {t("pos.emptyCartHint")}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-end px-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            setCart([])
                            toast.message(t("pos.cartCleared"))
                          }}
                          className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground transition-colors hover:text-destructive"
                        >
                          {t("pos.clearCart")}
                        </button>
                      </div>
                      {cart.map((item) => {
                        const lineKey = getCartLineKey(item.productId, item.priceTier ?? "retail")
                        const currentTier = item.priceTier ?? "retail"
                        const product = products.find((p) => p.id === item.productId)
                        const wholesaleAvailable = product ? hasWholesalePrice(product) : false
                        const saleUnit = formatUnit(
                          item.saleUnit ??
                            product?.unit ??
                            ""
                        ) || t("inventory.form.unitFallback")
                        const stockRecord = stocks[item.productId]
                        const stockLabel = product && stockRecord
                          ? formatDecomposedStockLabel(
                              stockRecord,
                              product,
                              t("inventory.stockBreakdownSeparator"),
                              formatUnit
                            )
                          : null
                        const availableForTier =
                          product && stockRecord
                            ? currentTier === "wholesale" &&
                              hasWholesalePrice(product) &&
                              (normalizeProduct(product).unitsPerPack ?? 1) > 1
                              ? stockRecord.packagingQty
                              : stockRecord.quantity
                            : null
                        const exceedsStock =
                          availableForTier != null &&
                          item.quantity > 0 &&
                          !isQuantityAtLeast(availableForTier, item.quantity)

                        return (
                          <div
                            key={lineKey}
                            className={cn(
                              "rounded-xl border bg-background p-3 shadow-sm transition-colors",
                              exceedsStock
                                ? "border-destructive/40 bg-destructive/5"
                                : "border-border/70"
                            )}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1 space-y-1.5">
                                <p className="truncate text-xs font-bold leading-tight text-foreground">
                                  {item.name}
                                </p>

                                <div className="flex flex-wrap items-center gap-1.5">
                                  {wholesaleAvailable ? (
                                    <div className="flex rounded-lg border border-border bg-muted/40 p-0.5">
                                      <button
                                        type="button"
                                        className={cn(
                                          "rounded-md px-2 py-0.5 text-[9px] font-bold uppercase transition-colors",
                                          currentTier === "retail"
                                            ? "bg-background text-foreground shadow-sm"
                                            : "text-muted-foreground hover:text-foreground"
                                        )}
                                        onClick={() =>
                                          handlePriceTierChange(item.productId, currentTier, "retail")
                                        }
                                      >
                                        {t("pos.priceTier.retailWithUnit", {
                                          unit:
                                            formatUnit(product?.unit ?? "") ||
                                            t("inventory.form.unitFallback"),
                                        })}
                                      </button>
                                      <button
                                        type="button"
                                        className={cn(
                                          "rounded-md px-2 py-0.5 text-[9px] font-bold uppercase transition-colors",
                                          currentTier === "wholesale"
                                            ? "bg-amber-500/15 text-amber-800 shadow-sm dark:text-amber-300"
                                            : "text-muted-foreground hover:text-foreground"
                                        )}
                                        onClick={() =>
                                          handlePriceTierChange(
                                            item.productId,
                                            currentTier,
                                            "wholesale"
                                          )
                                        }
                                      >
                                        {t("pos.priceTier.wholesaleWithUnit", {
                                          unit:
                                            (product
                                              ? formatUnit(normalizeProduct(product).packagingUnit)
                                              : "") ||
                                            t("inventory.form.packagingFallback"),
                                        })}
                                      </button>
                                    </div>
                                  ) : (
                                    <StatusBadge tone="slate" className="text-[8px]">
                                      {t("pos.priceTier.retailWithUnit", {
                                        unit:
                                          formatUnit(product?.unit ?? "") ||
                                          t("inventory.form.unitFallback"),
                                      })}
                                    </StatusBadge>
                                  )}

                                  {stockLabel && (
                                    <span
                                      className={cn(
                                        "text-[9px] font-semibold",
                                        exceedsStock
                                          ? "text-destructive"
                                          : "text-muted-foreground"
                                      )}
                                    >
                                      {t("pos.cartStockAvailable", { stock: stockLabel })}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 shrink-0 rounded-lg text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => updateQty(lineKey, -item.quantity)}
                                aria-label={t("pos.removeLine")}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>

                            <div className="mt-3 grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <Label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                                  {t("pos.quantity")}
                                  <span className="ml-1 font-semibold normal-case text-muted-foreground/80">
                                    ({saleUnit})
                                  </span>
                                </Label>
                                <div className="flex items-center gap-0.5 rounded-lg border border-border bg-muted/30 p-0.5">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 rounded-md bg-background"
                                    onClick={() => updateQty(lineKey, -1)}
                                  >
                                    <Minus className="h-3 w-3 text-muted-foreground" />
                                  </Button>
                                  <DecimalInput
                                    min={0}
                                    allowEmpty
                                    value={item.quantity}
                                    onValueChange={(qty) => setQtyValue(lineKey, qty)}
                                    onEmpty={() => clearQty(lineKey)}
                                    onBlur={() => commitQty(lineKey)}
                                    aria-label={t("pos.quantity")}
                                    className="h-7 flex-1 border-0 bg-transparent px-0 text-center text-xs font-extrabold shadow-none focus-visible:ring-0"
                                  />
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 rounded-md bg-background"
                                    onClick={() => updateQty(lineKey, 1)}
                                  >
                                    <Plus className="h-3 w-3 text-muted-foreground" />
                                  </Button>
                                </div>
                              </div>

                              <div className="space-y-1">
                                <Label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                                  {t("pos.unitPrice")}
                                </Label>
                                <Input
                                  type="number"
                                  min={0}
                                  value={item.unitPrice}
                                  onChange={(e) =>
                                    handlePriceEdit(lineKey, Number(e.target.value))
                                  }
                                  className="h-8 rounded-lg border border-input bg-background px-2 text-right text-xs font-semibold focus-visible:ring-primary/20"
                                />
                              </div>
                            </div>

                            <div className="mt-2.5 flex items-center justify-between border-t border-border/60 pt-2">
                              <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                                {t("pos.lineTotal")}
                              </span>
                              <span className="font-headline text-sm font-extrabold text-primary">
                                {formatAmount(item.total)}
                              </span>
                            </div>

                            {exceedsStock && (
                              <p className="mt-1.5 text-[9px] font-semibold text-destructive">
                                {t("pos.exceedsStock")}
                              </p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </div>

            {/* Totals Section & Checkout Cash-out */}
            <div className="p-5 bg-muted/30 border-t border-border space-y-5">
              <div className="space-y-3">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-muted-foreground">{t("pos.subtotal")}</span>
                  <span className="text-foreground">{formatAmount(subtotal)}</span>
                </div>
                <div className="flex justify-between items-center text-xs font-semibold">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Percent className="w-3.5 h-3.5" />
                    <span>{t("pos.globalDiscount")}</span>
                  </div>
                  <div className="relative">
                    <Input 
                      type="number" 
                      className="w-24 h-8 text-right px-2 rounded-lg border border-input bg-background font-bold text-xs" 
                      value={discount} 
                      onChange={(e) => setDiscount(Number(e.target.value))} 
                    />
                  </div>
                </div>
                
                <div className="flex justify-between items-center pt-3 border-t border-border">
                  <span className="font-extrabold text-[10px] uppercase tracking-wider text-muted-foreground">
                    {t("pos.netAmount")}
                  </span>
                  <span className="text-xl font-black text-primary font-headline tracking-tight">
                    {formatAmount(total)}
                  </span>
                </div>
              </div>

              {/* Cash-out checkout logic */}
              <Button
                onClick={handleOpenPayment}
                className="h-11 w-full rounded-xl text-sm font-bold shadow-sm transition-all duration-200 hover:shadow active:scale-[0.98]"
                disabled={cart.length === 0 || !cashSession}
              >
                {cart.length === 0
                  ? t("pos.emptyCartBtn")
                  : !cashSession
                    ? t("pos.closedCashBtn")
                    : t("pos.checkout", { amount: formatAmount(total) })}
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

