import type { Product } from "@/lib/types"
import { matchesAnySearchField, prepareSearchQuery } from "@/lib/search-utils"
import frMessages from "@/i18n/messages/fr.json"
import { getNestedMessage, nestMessages } from "@/i18n/nest-messages"
import { formatQuantity, roundQuantity } from "@/lib/quantity-utils"

const nestedFrMessages = nestMessages(frMessages)

export const PRODUCT_UNIT_DEFS = [
  { id: "piece", labelKey: "inventory.units.piece" },
  { id: "kg", labelKey: "inventory.units.kg" },
  { id: "liter", labelKey: "inventory.units.liter" },
  { id: "bag", labelKey: "inventory.units.bag" },
  { id: "carton", labelKey: "inventory.units.carton" },
  { id: "bottle", labelKey: "inventory.units.bottle" },
  { id: "box", labelKey: "inventory.units.box" },
  { id: "pack", labelKey: "inventory.units.pack" },
  { id: "crate", labelKey: "inventory.units.crate" },
  { id: "jerrycan", labelKey: "inventory.units.jerrycan" },
  { id: "sachet", labelKey: "inventory.units.sachet" },
  { id: "flask", labelKey: "inventory.units.flask" },
  { id: "bar", labelKey: "inventory.units.bar" },
  { id: "can", labelKey: "inventory.units.can" },
  { id: "roll", labelKey: "inventory.units.roll" },
] as const

export type ProductUnitId = (typeof PRODUCT_UNIT_DEFS)[number]["id"]

const PRODUCT_UNIT_LABEL_KEYS: Record<string, string> = Object.fromEntries(
  PRODUCT_UNIT_DEFS.map((unit) => [unit.id, unit.labelKey])
)

const PRODUCT_UNIT_ALIASES: Record<string, string> = {
  piece: "piece",
  kg: "kg",
  liter: "liter",
  litre: "liter",
  bag: "bag",
  carton: "carton",
  bottle: "bottle",
  box: "box",
  pack: "pack",
  crate: "crate",
  jerrycan: "jerrycan",
  sachet: "sachet",
  flask: "flask",
  bar: "bar",
  can: "can",
  roll: "roll",
  Pièce: "piece",
  Piece: "piece",
  Kg: "kg",
  KG: "kg",
  Kilogramme: "kg",
  Litre: "liter",
  Liter: "liter",
  Sac: "bag",
  Carton: "carton",
  Bouteille: "bottle",
  Boîte: "box",
  Boite: "box",
  Paquet: "pack",
  Pack: "pack",
  Casier: "crate",
  Bidon: "jerrycan",
  Sachet: "sachet",
  Flacon: "flask",
  Tablette: "bar",
  Cannette: "can",
  Rouleau: "roll",
}

for (const [from, to] of Object.entries({ ...PRODUCT_UNIT_ALIASES })) {
  PRODUCT_UNIT_ALIASES[from.toLowerCase()] = to
}

export const PRODUCT_UNITS = PRODUCT_UNIT_DEFS.map((unit) => ({
  value: unit.id,
  labelKey: unit.labelKey,
}))

export function canonicalizeProductUnit(unit: string | undefined | null): string {
  const trimmed = unit?.trim() ?? ""
  if (!trimmed) return trimmed
  return PRODUCT_UNIT_ALIASES[trimmed] ?? PRODUCT_UNIT_ALIASES[trimmed.toLowerCase()] ?? trimmed
}

export function getProductUnitLabel(
  unit: string | undefined | null,
  t: (key: string) => string
): string {
  const canonical = canonicalizeProductUnit(unit)
  const key = PRODUCT_UNIT_LABEL_KEYS[canonical]
  return key ? t(key) : (unit?.trim() ?? "")
}

export function getProductUnitLabelFr(unit: string | undefined | null): string {
  return getProductUnitLabel(unit, (key) => getNestedMessage(nestedFrMessages, key) ?? key)
}

export const DEFAULT_RETAIL_UNIT = "piece" as const


export const PACKAGING_UNITS = [
  "carton",
  "pack",
  "bag",
  "crate",
  "jerrycan",
  "box",
  "sachet",
  "flask",
  "bar",
  "can",
  "roll",
] as const


export const RETAIL_UNITS = [
  "piece",
  "jerrycan",
  "box",
  "kg",
  "sachet",
  "can",
  "flask",
  "bar",
  "bottle",
  "liter",
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
    packagingUnit: canonicalizeProductUnit(
      product.packagingUnit ?? product.conditionnement ?? ""
    ),
    unit: canonicalizeProductUnit(product.unit),
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
  return roundQuantity(packs * packUnits + loose)
}

export function decomposeStock(totalRetail: number, unitsPerPack: number) {
  const ratio = Math.max(1, unitsPerPack)
  const safeTotal = roundQuantity(Math.max(0, totalRetail))
  if (ratio <= 1) {
    return { packs: 0, loose: safeTotal }
  }
  const packs = Math.floor(safeTotal / ratio)
  const loose = roundQuantity(safeTotal - packs * ratio)
  return { packs, loose }
}

export function formatStockBreakdown(
  stock: number,
  product: Product,
  separator = " + ",
  formatUnit: (unit: string | undefined) => string = (unit) => unit ?? ""
): string | null {
  const normalized = normalizeProduct(product)
  const ratio = normalized.unitsPerPack
  if (ratio <= 1 || !normalized.packagingUnit) return null

  const { packs, loose } = decomposeStock(stock, ratio)
  const packLabel = formatUnit(normalized.packagingUnit)
  const unitLabel = formatUnit(normalized.unit)
  const parts: string[] = []
  if (packs > 0) {
    parts.push(`${formatQuantity(packs)} ${packLabel}`)
  }
  if (loose > 0) {
    parts.push(`${formatQuantity(loose)} ${unitLabel}`)
  }
  if (parts.length === 0) return `0 ${unitLabel}`
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
