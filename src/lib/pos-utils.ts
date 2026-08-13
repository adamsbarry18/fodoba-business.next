import type { SaleItem, Product, PriceTier } from "@/lib/types"
import type { PosPaymentMode } from "@/lib/constants/payment-methods"
import type { LucideIcon } from "lucide-react"
import { Wallet, HandCoins, CreditCard, Split } from "lucide-react"
import { getProductUnitLabelFr, normalizeProduct } from "@/lib/product-utils"
import { getSaleItemRetailQuantity as computeRetailQuantity } from "@/lib/stock-utils"

export function getCartLineKey(productId: string, priceTier: PriceTier = "retail"): string {
  return `${productId}:${priceTier}`
}

export function getProductPriceForTier(product: Product, tier: PriceTier): number {
  const normalized = normalizeProduct(product)
  if (tier === "wholesale" && normalized.wholesalePriceFCFA > 0) {
    return normalized.wholesalePriceFCFA
  }
  return product.sellingPriceFCFA
}

export function hasWholesalePrice(product: Product): boolean {
  return getProductPriceForTier(product, "wholesale") > 0
}

/** Unité persistée pour la quantité au panier / ticket (`piece` vs `carton`…). */
export function getSaleQuantityUnit(product: Product, tier: PriceTier): string {
  const normalized = normalizeProduct(product)
  if (
    tier === "wholesale" &&
    normalized.wholesalePriceFCFA > 0 &&
    normalized.packagingUnit
  ) {
    return normalized.packagingUnit
  }
  return normalized.unit
}

/** Quantité en unités détail à déduire du stock total (mouvements) */
export function getSaleItemRetailQuantity(item: SaleItem, product: Product): number {
  return computeRetailQuantity(item, product)
}

/** Statistiques / rapports : privilégie le snapshot enregistré sur la vente */
export function getSaleItemStatsQuantity(item: SaleItem, product?: Product): number {
  if (item.retailQuantity != null && item.retailQuantity > 0) {
    return item.retailQuantity
  }
  if (product) {
    return getSaleItemRetailQuantity(item, product)
  }
  return item.quantity
}

/**
 * Au basculement détail ↔ engros, on conserve le nombre saisi dans le panier.
 * (ex. 1 casier → détail = 1 pièce, pas 24). L'utilisateur ajuste ensuite.
 */
export function convertCartQuantityForTierChange(quantity: number): number {
  return Math.max(1, Math.floor(Number(quantity) || 1))
}

export function buildSaleItemFromProduct(
  product: Product,
  tier: PriceTier,
  quantity = 1
): SaleItem {
  const unitPrice = getProductPriceForTier(product, tier)
  return syncSaleItemQuantities(
    {
      productId: product.id,
      name: product.name,
      quantity,
      unitPrice,
      total: unitPrice * quantity,
      priceTier: tier,
    },
    product
  )
}

/** Recalcule saleUnit, retailQuantity et total après changement de qté ou de tier */
export function syncSaleItemQuantities(item: SaleItem, product: Product): SaleItem {
  const tier = item.priceTier ?? "retail"
  return {
    ...item,
    saleUnit: getSaleQuantityUnit(product, tier),
    retailQuantity: getSaleItemRetailQuantity(item, product),
    total: item.quantity * item.unitPrice,
  }
}

export function formatSaleItemName(item: SaleItem, wholesaleSuffix = " (Engros)"): string {
  return item.priceTier === "wholesale" ? `${item.name}${wholesaleSuffix}` : item.name
}

export function formatSaleItemQuantity(item: SaleItem): string {
  if (item.saleUnit) {
    return `${item.quantity} ${getProductUnitLabelFr(item.saleUnit)}`
  }
  return String(item.quantity)
}

export function getCartItemCount(cart: SaleItem[]): number {
  return cart.length
}

export function getCartSubtotal(cart: SaleItem[]): number {
  return cart.reduce((acc, item) => acc + item.total, 0)
}

export function applyCartDiscount(subtotal: number, discount: number): number {
  return Math.max(subtotal - discount, 0)
}

/** Suggestions d'espèces arrondies au-dessus du total (pas de 10 000). */
export function getCashQuickAmounts(total: number): number[] {
  if (total <= 0) return []
  const step = 10_000
  const first = Math.ceil(total / step) * step
  const amounts: number[] = []
  if (first > total) amounts.push(first)
  const second = first + step
  if (second > total) amounts.push(second)
  return amounts.slice(0, 2)
}

export const POS_PAYMENT_MODES: {
  id: PosPaymentMode
  labelKey: string
  shortLabelKey: string
  descriptionKey: string
  icon: LucideIcon
  tone: "success" | "warning" | "info" | "violet"
}[] = [
  {
    id: "comptant",
    labelKey: "pos.mode.comptant.label",
    shortLabelKey: "pos.mode.comptant.short",
    descriptionKey: "pos.mode.comptant.desc",
    icon: Wallet,
    tone: "success",
  },
  {
    id: "partiel",
    labelKey: "pos.mode.partiel.label",
    shortLabelKey: "pos.mode.partiel.short",
    descriptionKey: "pos.mode.partiel.desc",
    icon: HandCoins,
    tone: "warning",
  },
  {
    id: "credit",
    labelKey: "pos.mode.credit.label",
    shortLabelKey: "pos.mode.credit.short",
    descriptionKey: "pos.mode.credit.desc",
    icon: CreditCard,
    tone: "info",
  },
  {
    id: "fractionne",
    labelKey: "pos.mode.fractionne.label",
    shortLabelKey: "pos.mode.fractionne.short",
    descriptionKey: "pos.mode.fractionne.desc",
    icon: Split,
    tone: "violet",
  },
]
