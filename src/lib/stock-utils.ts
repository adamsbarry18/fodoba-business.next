import type { Product, SaleItem, StockLevel } from "@/lib/types"
import type { PriceTier } from "@/lib/types"
import {
  computeInitialStockTotal,
  decomposeStock,
  getRetailUnitsPerPack,
  normalizeProduct,
} from "@/lib/product-utils"

export type DecomposedStock = {
  packagingQty: number
  detailQty: number
  quantity: number
}

/** Lit un stock Firestore (ancien ou nouveau format) en conditionnement + détail */
export function normalizeStockLevel(
  stock: StockLevel | null | undefined,
  unitsPerPack: number
): DecomposedStock {
  const ratio = Math.max(1, unitsPerPack)

  if (stock?.packagingQty != null && stock?.detailQty != null) {
    const packagingQty = Math.max(0, stock.packagingQty)
    const detailQty = Math.max(0, stock.detailQty)
    // `unitsPerPack` ici = unités détail / colis (conditionnement × qté détail)
    return {
      packagingQty,
      detailQty,
      quantity: packagingQty * ratio + detailQty,
    }
  }

  const total = Math.max(0, stock?.quantity ?? 0)
  if (ratio <= 1) {
    return { packagingQty: 0, detailQty: total, quantity: total }
  }

  const { packs, loose } = decomposeStock(total, ratio)
  return { packagingQty: packs, detailQty: loose, quantity: total }
}

export function buildStockLevelPayload(
  productId: string,
  storeId: string,
  decomposed: DecomposedStock
): Omit<StockLevel, "lastUpdated"> & { quantity: number } {
  return {
    productId,
    storeId,
    packagingQty: decomposed.packagingQty,
    detailQty: decomposed.detailQty,
    quantity: decomposed.quantity,
  }
}

export function buildDecomposedStock(
  packagingQty: number,
  detailQty: number,
  unitsPerPack: number,
  retailQtyFactor = 1
): DecomposedStock {
  const packaging = Math.max(0, packagingQty)
  const detail = Math.max(0, detailQty)
  const ratio = Math.max(1, unitsPerPack)
  return {
    packagingQty: packaging,
    detailQty: detail,
    quantity: computeInitialStockTotal(packaging, ratio, detail, retailQtyFactor),
  }
}

function usesPackagingTier(product: Product, tier: PriceTier): boolean {
  const normalized = normalizeProduct(product)
  return (
    tier === "wholesale" &&
    normalized.wholesalePriceFCFA > 0 &&
    normalized.unitsPerPack > 1 &&
    !!normalized.packagingUnit
  )
}

/** Delta total en unités détail (mouvements / compatibilité) */
export function getSaleItemRetailQuantity(item: SaleItem, product: Product): number {
  const normalized = normalizeProduct(product)
  const tier = item.priceTier ?? "retail"
  const qty = Math.max(0, Number(item.quantity) || 0)
  if (qty === 0) return 0

  if (usesPackagingTier(product, tier)) {
    return qty * getRetailUnitsPerPack(normalized)
  }
  return qty
}

export type SaleStockValidationError =
  | "INSUFFICIENT_RETAIL"
  | "INSUFFICIENT_PACKAGING"
  | "INVALID_QUANTITY"

/**
 * Engros : uniquement des conditionnements complets (carton, casier…).
 * Détail : pièces — peut ouvrir un conditionnement si le vrac ne suffit pas
 * (ex. 2 cartons × 12, vente 6 pièces → 1 carton + 6 pièces).
 */
export function validateSaleItemAgainstStock(
  stock: DecomposedStock,
  product: Product,
  item: SaleItem
): SaleStockValidationError | null {
  const qty = Math.max(0, Number(item.quantity) || 0)
  if (qty <= 0) return "INVALID_QUANTITY"

  const tier = item.priceTier ?? "retail"
  if (usesPackagingTier(product, tier)) {
    return stock.packagingQty >= qty ? null : "INSUFFICIENT_PACKAGING"
  }
  // Détail : stock total disponible (vrac + contenu des conditionnements)
  return stock.quantity >= qty ? null : "INSUFFICIENT_RETAIL"
}

/** Applique une ligne de vente sur le stock décomposé */
export function applySaleItemToDecomposedStock(
  stock: DecomposedStock,
  product: Product,
  item: SaleItem
): DecomposedStock {
  const normalized = normalizeProduct(product)
  const ratio = getRetailUnitsPerPack(normalized)
  const tier = item.priceTier ?? "retail"
  const qty = Math.max(0, Number(item.quantity) || 0)

  const error = validateSaleItemAgainstStock(stock, product, item)
  if (error === "INSUFFICIENT_RETAIL") {
    throw new Error(
      `Stock insuffisant pour ${item.name}. Disponible : ${stock.quantity} ${normalized.unit}`
    )
  }
  if (error === "INSUFFICIENT_PACKAGING") {
    const unit = normalized.packagingUnit || normalized.unit
    throw new Error(
      `Stock conditionnement insuffisant pour ${item.name}. Disponible : ${stock.packagingQty} ${unit}`
    )
  }
  if (error === "INVALID_QUANTITY") {
    throw new Error(`Quantité invalide pour ${item.name}`)
  }

  // Engros : décrémente uniquement les conditionnements complets
  if (usesPackagingTier(product, tier)) {
    return buildDecomposedStock(
      stock.packagingQty - qty,
      stock.detailQty,
      normalized.unitsPerPack,
      normalized.retailQtyFactor
    )
  }

  // Détail : consomme le vrac, puis ouvre des conditionnements si besoin
  return applyRetailQuantityOut(stock, qty, ratio)
}

/** Applique plusieurs lignes du même produit */
export function applySaleItemsToDecomposedStock(
  initial: DecomposedStock,
  product: Product,
  items: SaleItem[]
): DecomposedStock {
  return items.reduce(
    (acc, item) => applySaleItemToDecomposedStock(acc, product, item),
    initial
  )
}

/** Réception achat : quantité saisie en unités de conditionnement si produit conditionné */
export function applyPurchaseQuantityToDecomposedStock(
  stock: DecomposedStock,
  product: Product,
  purchaseQty: number
): DecomposedStock {
  const normalized = normalizeProduct(product)
  const qty = Math.max(0, purchaseQty)

  if (normalized.unitsPerPack > 1 && normalized.packagingUnit) {
    return buildDecomposedStock(
      stock.packagingQty + qty,
      stock.detailQty,
      normalized.unitsPerPack,
      normalized.retailQtyFactor
    )
  }
  return buildDecomposedStock(
    stock.packagingQty,
    stock.detailQty + qty,
    normalized.unitsPerPack,
    normalized.retailQtyFactor
  )
}

/**
 * Retire des unités détail (transfert sortant, ajustement −N).
 * Consomme d'abord le stock détail, puis ouvre les conditionnements si nécessaire.
 */
export function applyRetailQuantityOut(
  stock: DecomposedStock,
  quantity: number,
  unitsPerPack: number
): DecomposedStock {
  const ratio = Math.max(1, unitsPerPack)
  const qty = Math.max(0, quantity)
  if (qty === 0) return stock
  if (stock.quantity < qty) {
    throw new Error(`Stock insuffisant. Disponible : ${stock.quantity}`)
  }

  let packagingQty = stock.packagingQty
  let detailQty = stock.detailQty
  let remaining = qty

  if (detailQty >= remaining) {
    return buildDecomposedStock(packagingQty, detailQty - remaining, ratio)
  }

  remaining -= detailQty
  detailQty = 0

  while (remaining > 0) {
    if (packagingQty <= 0) {
      throw new Error(`Stock insuffisant. Disponible : ${stock.quantity}`)
    }
    packagingQty -= 1
    if (remaining < ratio) {
      detailQty = ratio - remaining
      remaining = 0
    } else {
      remaining -= ratio
    }
  }

  return buildDecomposedStock(packagingQty, detailQty, ratio)
}

/** Ajoute des unités détail (transfert entrant, ajustement +N) */
export function applyRetailQuantityIn(
  stock: DecomposedStock,
  quantity: number,
  unitsPerPack: number
): DecomposedStock {
  const qty = Math.max(0, quantity)
  if (qty === 0) return stock
  return buildDecomposedStock(stock.packagingQty, stock.detailQty + qty, unitsPerPack)
}

export function formatDecomposedStockLabel(
  stock: DecomposedStock,
  product: Product,
  separator = " + "
): string {
  const normalized = normalizeProduct(product)
  const parts: string[] = []

  if (normalized.packagingUnit && normalized.unitsPerPack > 1 && stock.packagingQty > 0) {
    parts.push(`${stock.packagingQty} ${normalized.packagingUnit}`)
  }
  if (stock.detailQty > 0) {
    parts.push(`${stock.detailQty} ${normalized.unit}`)
  }
  if (parts.length === 0) {
    return `0 ${normalized.unit}`
  }
  return parts.join(separator)
}
