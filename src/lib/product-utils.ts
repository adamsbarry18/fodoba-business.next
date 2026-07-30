import type { Product } from "@/lib/types"
import { matchesAnySearchField, prepareSearchQuery } from "@/lib/search-utils"

export const PRODUCT_UNITS = [
  { value: "Kg", label: "Kilogramme (Kg)" },
  { value: "Litre", label: "Litre (L)" },
  { value: "Pièce", label: "Pièce (Pce)" },
  { value: "Sac", label: "Sac" },
  { value: "Carton", label: "Carton" },
  { value: "Bouteille", label: "Bouteille" },
  { value: "Boîte", label: "Boîte" },
  { value: "Paquet", label: "Paquet" },
] as const

/**
 * Unités engros / conditionnement — basées sur l’usage réel stock FODOBA
 * (carton, paquet, sac, pack, casier, bidon…).
 */
export const PACKAGING_UNITS = [
  "Carton",
  "Paquet",
  "Sac",
  "Pack",
  "Casier",
  "Bidon",
  "Boîte",
  "Sachet",
  "Flacon",
  "Tablette",
  "Cannette",
  "Rouleau",
] as const

/**
 * Unités détail / vente à l’unité — basées sur l’usage réel stock FODOBA.
 */
export const RETAIL_UNITS = [
  "Pièce",
  "Bidon",
  "Boîte",
  "Kg",
  "Sachet",
  "Cannette",
  "Flacon",
  "Tablette",
  "Bouteille",
  "Litre",
] as const

export type StockFilter = "all" | "low" | "out"

export type ProductDeleteBlocker = "stock" | "movements"

export function getProductDeleteBlockerMessageKey(
  blocker: ProductDeleteBlocker
): string {
  switch (blocker) {
    case "stock":
      return "inventory.deleteBlocked.stock"
    case "movements":
      return "inventory.deleteBlocked.movements"
    default:
      return "inventory.deleteBlocked.movements"
  }
}

export function normalizeProduct(product: Product): Product {
  return {
    ...product,
    unitsPerPack: product.unitsPerPack ?? 1,
    retailQtyFactor: product.retailQtyFactor ?? 1,
    wholesalePriceFCFA: product.wholesalePriceFCFA ?? 0,
    packagingUnit: product.packagingUnit ?? product.conditionnement ?? "",
  }
}

/** Génère un SKU court et lisible (ex. `JDO-A3K9M`, ~8–10 car.). */
export function generateProductSku(name: string): string {
  const normalized = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()

  const words = normalized.split(/[^a-zA-Z0-9]+/).filter((w) => w.length > 0)

  let prefix: string
  if (words.length >= 2) {
    prefix = words
      .slice(0, 4)
      .map((w) => (/^\d/.test(w) ? w[0] : w[0]))
      .join("")
      .toUpperCase()
      .slice(0, 4)
  } else if (words.length === 1) {
    prefix = words[0].toUpperCase().slice(0, 4)
  } else {
    prefix = "PRD"
  }

  if (prefix.length < 2) prefix = "PRD"

  const timePart = Date.now().toString(36).slice(-3).toUpperCase()
  const randomPart = Math.random().toString(36).slice(2, 5).toUpperCase()
  return `${prefix}-${timePart}${randomPart}`
}

/**
 * Unités détail par colis = conditionnement × qté détail.
 * Ex. 10 canettes/casier × facteur 4 → 40 unités détail par casier.
 */
export function getRetailUnitsPerPack(
  product: Pick<Product, "unitsPerPack" | "retailQtyFactor"> | {
    unitsPerPack?: number
    retailQtyFactor?: number
  }
): number {
  return Math.max(1, product.unitsPerPack ?? 1) * Math.max(1, product.retailQtyFactor ?? 1)
}

/**
 * Stock total calculé :
 * conditionnement × qté_détail × stock_initial + stock_détail
 */
export function computeInitialStockTotal(
  initialPackaging: number,
  unitsPerPack: number,
  detailStock = 0,
  retailQtyFactor = 1
): number {
  const packs = Math.max(0, initialPackaging)
  const packUnits = Math.max(1, unitsPerPack) * Math.max(1, retailQtyFactor)
  const loose = Math.max(0, detailStock)
  return packs * packUnits + loose
}

export function decomposeStock(totalRetail: number, unitsPerPack: number) {
  const ratio = Math.max(1, unitsPerPack)
  if (ratio <= 1) {
    return { packs: 0, loose: Math.max(0, totalRetail) }
  }
  const safeTotal = Math.max(0, totalRetail)
  const packs = Math.floor(safeTotal / ratio)
  const loose = safeTotal % ratio
  return { packs, loose }
}

export function formatStockBreakdown(
  stock: number,
  product: Product,
  separator = " + "
): string | null {
  const normalized = normalizeProduct(product)
  const ratio = normalized.unitsPerPack
  if (ratio <= 1 || !normalized.packagingUnit) return null

  const { packs, loose } = decomposeStock(stock, ratio)
  const parts: string[] = []
  if (packs > 0) {
    parts.push(`${packs} ${normalized.packagingUnit}`)
  }
  if (loose > 0) {
    parts.push(`${loose} ${normalized.unit}`)
  }
  if (parts.length === 0) return `0 ${normalized.unit}`
  return parts.join(separator)
}

export function isLowStock(stock: number, threshold: number): boolean {
  return stock > 0 && stock <= threshold
}

export function isOutOfStock(stock: number): boolean {
  return stock <= 0
}

export function getStockStatus(
  stock: number,
  threshold: number
): "ok" | "low" | "out" {
  if (isOutOfStock(stock)) return "out"
  if (isLowStock(stock, threshold)) return "low"
  return "ok"
}

export function estimateStockValue(
  products: Product[],
  stocks: Record<string, number>
): number {
  return products.reduce((acc, p) => {
    const qty = stocks[p.id] ?? 0
    return acc + qty * p.sellingPriceFCFA
  }, 0)
}

export function countLowStock(
  products: Product[],
  stocks: Record<string, number>
): number {
  return products.filter((p) => isLowStock(stocks[p.id] ?? 0, p.lowStockThreshold)).length
}

export function countOutOfStock(
  products: Product[],
  stocks: Record<string, number>
): number {
  return products.filter((p) => isOutOfStock(stocks[p.id] ?? 0)).length
}

export function filterProducts(
  products: Product[],
  options: {
    search?: string
    categoryId?: string
    stockFilter?: StockFilter
    stocks?: Record<string, number>
  }
): Product[] {
  const term = prepareSearchQuery(options.search)
  const categoryId = options.categoryId
  const stockFilter = options.stockFilter ?? "all"
  const stocks = options.stocks ?? {}

  return products.filter((p) => {
    const matchesSearch =
      !term ||
      matchesAnySearchField([p.name, p.sku, p.barcode], term)

    const matchesCategory =
      !categoryId || categoryId === "all" || p.categoryId === categoryId

    const stock = stocks[p.id] ?? 0
    const status = getStockStatus(stock, p.lowStockThreshold ?? 10)
    const matchesStock =
      stockFilter === "all" ||
      (stockFilter === "low" && status === "low") ||
      (stockFilter === "out" && status === "out")

    return matchesSearch && matchesCategory && matchesStock
  })
}
