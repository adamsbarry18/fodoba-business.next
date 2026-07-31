import type { CashSession, Purchase, Sale, StockMovement } from "@/lib/types"
import { resolvePaymentMethodDisplay } from "@/lib/constants/payment-methods"

type TranslateFn = (key: string, params?: Record<string, string | number>) => string

export type SalePrintLabels = {
  walkIn: string
  client: string
  phone: string
  seller: string
  clientTypeParticulier: string
  clientTypeGrossiste: string
  wholesaleSuffix: string
  invoice: string
  invoiceNumber: string
  date: string
  total: string
  totalGeneral: string
  subtotal: string
  discount: string
  amountPaid: string
  remainingDue: string
  paymentsTitle: string
  titleInvoice: string
  tableDesignation: string
  tableQty: string
  tableUnitPrice: string
  tableTotal: string
}

export type PurchasePrintLabels = {
  title: string
  order: string
  date: string
  store: string
  supplier: string
  status: string
  preparedBy: string
  notes: string
  product: string
  qty: string
  unitCost: string
  currency: string
  totalFcfa: string
}

export type TransferPrintLabels = {
  title: string
  reference: string
  date: string
  responsible: string
  article: string
  quantity: string
  unit: string
  source: string
  pieceUnit: string
}

export type StockHistoryPrintLabels = {
  title: string
  store: string
  generatedOn: string
  exportedMovements: string
  tableDate: string
  tableProduct: string
  tableType: string
  tableDelta: string
  tableFinalStock: string
  tableAuthor: string
  tableReason: string
}

export type CashAuditPrintLabels = {
  title: string
  store: string
  generatedOn: string
  sessionsAnalyzed: string
  globalVariance: string
  reliability: string
  conformClosures: string
  consolidatedSummary: string
  tableOpened: string
  tableClosed: string
  tableCashier: string
  tableExpected: string
  tableActual: string
  tableVariance: string
  tableStatus: string
  tableCashLine: string
  tableExpectedCumul: string
  tableActualCumul: string
  tableVarianceCumul: string
  statusOpen: string
  statusConform: string
  statusVariance: string
}

export type ProductSheetPrintLabels = {
  title: string
  sku: string
  barcode: string
  category: string
  retailUnit: string
  packagingUnit: string
  packagingContent: string
  formatPackagingValue: (count: number, unit: string, packaging: string) => string
  packagingFallback: string
  retailPrice: string
  wholesalePrice: string
  purchasePrice: string
  manufacturingDate: string
  expirationDate: string
  lowStockThreshold: string
  status: string
  active: string
  inactive: string
  priceGnf: string
  priceUsd: string
  priceEur: string
  stockByStore: string
  tableStore: string
  tableCode: string
  tableQuantity: string
  tableUnit: string
  qrCode: string
  generatedOn: string
}

export type SalesReportPrintLabels = {
  title: string
  period: string
  store: string
  exportedSales: string
  revenue: string
  walkIn: string
  tableDate: string
  tableNumber: string
  tableClient: string
  tablePhone: string
  tableSeller: string
  tableTotal: string
  tableStatus: string
}

export type PrintLabels = {
  phoneShort: string
  sale: SalePrintLabels
  purchase: PurchasePrintLabels
  transfer: TransferPrintLabels
  stockHistory: StockHistoryPrintLabels
  cashAudit: CashAuditPrintLabels
  productSheet: ProductSheetPrintLabels
  salesReport: SalesReportPrintLabels
  resolvePaymentMethod: (method: string) => string
  resolveSaleStatus: (status: Sale["status"]) => string
  resolvePurchaseStatus: (status: Purchase["status"]) => string
  resolveStockMovementType: (type: StockMovement["type"]) => string
  resolveCashSessionStatus: (
    session: CashSession,
    totalVariance: number
  ) => string
}

export function getPrintLabels(t: TranslateFn): PrintLabels {
  return {
    phoneShort: t("print.phoneShort"),
    sale: {
      walkIn: t("pos.walkInClient"),
      client: t("print.client"),
      phone: t("common.phone"),
      seller: t("print.seller"),
      clientTypeParticulier: t("badges.clientType.particulier"),
      clientTypeGrossiste: t("badges.clientType.grossiste"),
      wholesaleSuffix: t("print.wholesaleSuffix"),
      invoice: t("print.invoice"),
      invoiceNumber: t("print.invoiceNumber"),
      date: t("print.date"),
      total: t("print.total"),
      totalGeneral: t("print.totalGeneral"),
      subtotal: t("print.sale.subtotal"),
      discount: t("print.sale.discount"),
      amountPaid: t("print.sale.amountPaid"),
      remainingDue: t("print.sale.remainingDue"),
      paymentsTitle: t("print.sale.paymentsTitle"),
      titleInvoice: t("print.saleInvoiceTitle"),
      tableDesignation: t("print.table.designation"),
      tableQty: t("print.table.qty"),
      tableUnitPrice: t("print.table.unitPrice"),
      tableTotal: t("print.table.totalFcfa"),
    },
    purchase: {
      title: t("print.purchaseOrderTitle"),
      order: t("print.order"),
      date: t("print.date"),
      store: t("print.store"),
      supplier: t("print.supplier"),
      status: t("print.status"),
      preparedBy: t("print.preparedBy"),
      notes: t("print.notes"),
      product: t("print.table.product"),
      qty: t("print.table.qty"),
      unitCost: t("print.table.unitCost"),
      currency: t("print.table.currency"),
      totalFcfa: t("print.table.totalFcfa"),
    },
    transfer: {
      title: t("print.transferTitle"),
      reference: t("print.reference"),
      date: t("print.date"),
      responsible: t("print.responsible"),
      article: t("print.table.article"),
      quantity: t("print.table.quantity"),
      unit: t("print.table.unit"),
      source: t("print.table.source"),
      pieceUnit: t("print.pieceUnit"),
    },
    stockHistory: {
      title: t("print.stockHistoryTitle"),
      store: t("print.store"),
      generatedOn: t("print.generatedOn"),
      exportedMovements: t("print.exportedMovements"),
      tableDate: t("print.table.date"),
      tableProduct: t("print.table.product"),
      tableType: t("print.table.type"),
      tableDelta: t("print.table.delta"),
      tableFinalStock: t("print.table.finalStock"),
      tableAuthor: t("print.table.author"),
      tableReason: t("print.table.reason"),
    },
    cashAudit: {
      title: t("print.cashAuditTitle"),
      store: t("print.store"),
      generatedOn: t("print.generatedOn"),
      sessionsAnalyzed: t("print.sessionsAnalyzed"),
      globalVariance: t("print.globalVariance"),
      reliability: t("print.reliability"),
      conformClosures: t("print.conformClosures"),
      consolidatedSummary: t("print.consolidatedSummary"),
      tableOpened: t("print.table.opened"),
      tableClosed: t("print.table.closed"),
      tableCashier: t("print.table.cashier"),
      tableExpected: t("print.table.expected"),
      tableActual: t("print.table.actual"),
      tableVariance: t("print.table.variance"),
      tableStatus: t("print.table.status"),
      tableCashLine: t("print.table.cashLine"),
      tableExpectedCumul: t("print.table.expectedCumul"),
      tableActualCumul: t("print.table.actualCumul"),
      tableVarianceCumul: t("print.table.varianceCumul"),
      statusOpen: t("print.cashAudit.statusOpen"),
      statusConform: t("print.cashAudit.statusConform"),
      statusVariance: t("print.cashAudit.statusVariance"),
    },
    productSheet: {
      title: t("print.productSheetTitle"),
      sku: t("print.product.sku"),
      barcode: t("print.product.barcode"),
      category: t("print.product.category"),
      retailUnit: t("print.product.retailUnit"),
      packagingUnit: t("inventory.form.packagingUnit"),
      packagingContent: t("inventory.form.unitsPerPack"),
      formatPackagingValue: (count, unit, packaging) =>
        t("print.product.packagingValue", { count, unit, packaging }),
      packagingFallback: t("inventory.form.packagingFallback"),
      retailPrice: t("inventory.form.retailPrice"),
      wholesalePrice: t("inventory.form.wholesalePrice"),
      purchasePrice: t("inventory.detail.purchasePrice"),
      manufacturingDate: t("inventory.detail.manufacturingDate"),
      expirationDate: t("inventory.detail.expirationDate"),
      lowStockThreshold: t("print.product.lowStockThreshold"),
      status: t("print.status"),
      active: t("print.product.active"),
      inactive: t("print.product.inactive"),
      priceGnf: t("inventory.detail.priceGnf"),
      priceUsd: t("inventory.detail.priceUsd"),
      priceEur: t("print.product.priceEur"),
      stockByStore: t("print.product.stockByStore"),
      tableStore: t("print.table.store"),
      tableCode: t("print.table.code"),
      tableQuantity: t("print.table.quantity"),
      tableUnit: t("print.table.unit"),
      qrCode: t("print.product.qrCode"),
      generatedOn: t("print.generatedOn"),
    },
    salesReport: {
      title: t("print.salesReportTitle"),
      period: t("print.period"),
      store: t("print.store"),
      exportedSales: t("print.exportedSales"),
      revenue: t("print.revenue"),
      walkIn: t("pos.walkInClient"),
      tableDate: t("print.table.date"),
      tableNumber: t("print.table.number"),
      tableClient: t("print.client"),
      tablePhone: t("common.phone"),
      tableSeller: t("print.seller"),
      tableTotal: t("print.table.totalFcfa"),
      tableStatus: t("print.table.status"),
    },
    resolvePaymentMethod: (method) =>
      resolvePaymentMethodDisplay(method, (key) => t(key)),
    resolveSaleStatus: (status) => t(`badges.saleStatus.${status}`),
    resolvePurchaseStatus: (status) => t(`badges.purchaseStatus.${status}`),
    resolveStockMovementType: (type) => t(`badges.stockMovement.${type}`),
    resolveCashSessionStatus: (session, totalVariance) => {
      if (session.status === "OPEN") {
        return t("print.cashAudit.statusOpen")
      }
      return totalVariance === 0
        ? t("print.cashAudit.statusConform")
        : t("print.cashAudit.statusVariance")
    },
  }
}

/** @deprecated Utiliser getPrintLabels(t).sale */
export function getSalePrintLabels(t: TranslateFn): SalePrintLabels {
  return getPrintLabels(t).sale
}
