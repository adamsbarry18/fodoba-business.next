
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';
import { format } from 'date-fns';
import { Sale, Store, Purchase, StockMovement, Product, CashSession } from '@/lib/types';
import { formatPdfMoney, formatPdfNumber, sanitizePdfText } from '@/lib/utils';
import { PAYMENT_METHOD_IDS } from '@/lib/constants/payment-methods';
import { getAppName } from '@/lib/constants/branding';
import { normalizeProduct, getProductUnitLabelFr } from '@/lib/product-utils';
import { formatDecomposedStockLabel, type DecomposedStock } from '@/lib/stock-utils';
import { formatSaleItemName, formatSaleItemQuantity } from '@/lib/pos-utils';
import { buildSaleClientReceiptLines, isRegisteredSaleClient } from '@/lib/sale-client-utils';
import type {
  PrintLabels,
  SalePrintLabels,
} from '@/lib/print-labels';

export type { SalePrintLabels } from '@/lib/print-labels';

/** Formate un montant stocké en FCFA pour les PDF (devise de référence). */
export type PdfMoneyFormatter = (amountFcfa: number) => string;

function defaultPdfMoney(amountFcfa: number): string {
  return formatPdfMoney(amountFcfa);
}

/** `formatAmount` UI → texte PDF sans espaces Unicode (sinon glyphes cassés). */
function resolvePdfMoney(formatMoney?: PdfMoneyFormatter): PdfMoneyFormatter {
  const base = formatMoney ?? defaultPdfMoney;
  return (amountFcfa) => sanitizePdfText(base(amountFcfa));
}

interface JsPdfWithAutoTable extends jsPDF {
  lastAutoTable: { finalY: number };
}

function getAutoTableFinalY(doc: jsPDF): number {
  return (doc as JsPdfWithAutoTable).lastAutoTable.finalY;
}

function drawSaleClientLines(
  doc: jsPDF,
  sale: Sale,
  labels: SalePrintLabels,
  x: number,
  startY: number,
  fontSize = 9
): number {
  doc.setFontSize(fontSize);
  doc.setFont('helvetica', 'normal');
  const lines = buildSaleClientReceiptLines(sale, labels);
  let y = startY;
  for (const line of lines) {
    doc.text(line, x, y);
    y += fontSize === 8 ? 4 : 5;
  }
  return y;
}

function drawSalePaymentSummary(
  doc: jsPDF,
  sale: Sale,
  saleLabels: SalePrintLabels,
  labels: PrintLabels,
  pageWidth: number,
  startY: number,
  fontSize = 8,
  formatMoney: PdfMoneyFormatter = defaultPdfMoney
): number {
  let y = startY;
  const rightX = pageWidth - 5;
  const lineHeight = fontSize === 8 ? 4 : 5;
  const money = resolvePdfMoney(formatMoney);

  doc.setFontSize(fontSize);
  doc.setFont('helvetica', 'normal');

  if (sale.discount > 0) {
    doc.text(sanitizePdfText(`${saleLabels.subtotal}: ${money(sale.subtotal)}`), 5, y);
    y += lineHeight;
    doc.text(sanitizePdfText(`${saleLabels.discount}: -${money(sale.discount)}`), 5, y);
    y += lineHeight;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(fontSize + (fontSize === 8 ? 1 : 2));
  doc.text(sanitizePdfText(`${saleLabels.total}:`), 5, y);
  doc.text(money(sale.total), rightX, y, { align: 'right' });
  y += lineHeight + 1;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(fontSize);

  const paidPayments = sale.payments.filter((payment) => payment.amount > 0);
  if (paidPayments.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.text(sanitizePdfText(`${saleLabels.paymentsTitle}:`), 5, y);
    y += lineHeight;
    doc.setFont('helvetica', 'normal');
    for (const payment of paidPayments) {
      const methodLabel = labels.resolvePaymentMethod(payment.method);
      doc.text(
        sanitizePdfText(`- ${methodLabel}: ${money(payment.amount)}`),
        5,
        y
      );
      y += lineHeight;
    }
  }

  doc.text(sanitizePdfText(`${saleLabels.amountPaid}: ${money(sale.amountPaid)}`), 5, y);
  y += lineHeight;

  if (sale.debtAmount > 0) {
    doc.setFont('helvetica', 'bold');
    doc.text(sanitizePdfText(`${saleLabels.remainingDue}: ${money(sale.debtAmount)}`), 5, y);
    y += lineHeight;
  }

  return y;
}

/**
 * Service pour la génération et l'impression des documents PDF officiels.
 * Les libellés sont injectés via getPrintLabels(t) pour respecter la locale active.
 */
export const PrintService = {
  async generateThermalTicket(sale: Sale, store: Store, labels: PrintLabels, formatMoney: PdfMoneyFormatter = defaultPdfMoney) {
    formatMoney = resolvePdfMoney(formatMoney);
    const saleLabels = labels.sale;
    const paymentLineCount =
      (sale.discount > 0 ? 2 : 0) +
      1 +
      (sale.payments.filter((p) => p.amount > 0).length > 0
        ? sale.payments.filter((p) => p.amount > 0).length + 1
        : 0) +
      1 +
      (sale.debtAmount > 0 ? 1 : 0);
    const ticketHeight = Math.min(
      280,
      Math.max(200, 130 + sale.items.length * 6 + paymentLineCount * 5)
    );
    const doc = new jsPDF({
      unit: 'mm',
      format: [80, ticketHeight],
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    let y = 10;

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(getAppName(), pageWidth / 2, y, { align: 'center' });
    y += 6;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(store.name, pageWidth / 2, y, { align: 'center' });
    y += 4;
    doc.text(store.address, pageWidth / 2, y, { align: 'center' });
    y += 4;
    doc.text(`${labels.phoneShort}: ${store.phone}`, pageWidth / 2, y, { align: 'center' });
    y += 8;

    doc.setFontSize(9);
    doc.text(`${saleLabels.invoice}: #${sale.id.slice(-6).toUpperCase()}`, 5, y);
    y += 5;
    const dateStr = sale.timestamp?.toDate ? format(sale.timestamp.toDate(), 'dd/MM/yyyy HH:mm') : format(new Date(), 'dd/MM/yyyy HH:mm');
    doc.text(`${saleLabels.date}: ${dateStr}`, 5, y);
    y += 5;
    y = drawSaleClientLines(doc, sale, saleLabels, 5, y, 8) + 5;

    autoTable(doc, {
      startY: y,
      margin: { left: 5, right: 5 },
      body: sale.items.map(item => [
        formatSaleItemName(item, saleLabels.wholesaleSuffix),
        `${formatSaleItemQuantity(item)} x ${formatPdfNumber(item.unitPrice)}`,
        formatPdfNumber(item.total)
      ]),
      theme: 'plain',
      styles: { fontSize: 8, cellPadding: 1 },
    });

    y = drawSalePaymentSummary(doc, sale, saleLabels, labels, pageWidth, getAutoTableFinalY(doc) + 4, 8, formatMoney) + 4;

    try {
      const qrDataUrl = await QRCode.toDataURL(sale.id);
      doc.addImage(qrDataUrl, 'PNG', pageWidth / 2 - 10, y, 20, 20);
    } catch {}

    doc.save(`Ticket_${sale.id.slice(-6).toUpperCase()}.pdf`);
  },

  async generateA4Invoice(sale: Sale, store: Store, labels: PrintLabels, formatMoney: PdfMoneyFormatter = defaultPdfMoney) {
    formatMoney = resolvePdfMoney(formatMoney);
    const saleLabels = labels.sale;
    const doc = new jsPDF('p', 'mm', 'a4');
    this.drawHeader(doc, saleLabels.titleInvoice, store, labels.phoneShort);
    
    let y = 50;
    doc.setFontSize(10);
    doc.text(`${saleLabels.invoiceNumber}: #${sale.id.slice(-6).toUpperCase()}`, 20, y);
    doc.text(`${saleLabels.date}: ${sale.timestamp?.toDate ? format(sale.timestamp.toDate(), 'dd/MM/yyyy') : ''}`, 20, y + 5);
    drawSaleClientLines(doc, sale, saleLabels, 140, y);
    const tableStartY = isRegisteredSaleClient(sale) && (sale.clientPhone || sale.clientType) ? y + 25 : y + 20;

    autoTable(doc, {
      startY: tableStartY,
      head: [[
        saleLabels.tableDesignation,
        saleLabels.tableQty,
        saleLabels.tableUnitPrice,
        saleLabels.tableTotal,
      ]],
      body: sale.items.map(i => [
        formatSaleItemName(i, saleLabels.wholesaleSuffix),
        formatSaleItemQuantity(i),
        formatPdfNumber(i.unitPrice),
        formatPdfNumber(i.total),
      ]),
      headStyles: { fillColor: [29, 217, 124] }
    });

    y = getAutoTableFinalY(doc) + 8;
    drawSalePaymentSummary(doc, sale, saleLabels, labels, 190, y, 10, formatMoney);

    doc.save(`Vente_${sale.id.slice(-6)}.pdf`);
  },

  async generatePurchaseOrder(purchase: Purchase, store: Store, labels: PrintLabels, formatMoney: PdfMoneyFormatter = defaultPdfMoney) {
    formatMoney = resolvePdfMoney(formatMoney);
    const l = labels.purchase;
    const doc = new jsPDF('p', 'mm', 'a4');
    this.drawHeader(doc, l.title, store, labels.phoneShort);
    
    const y = 50;
    doc.setFontSize(10);
    doc.text(`${l.order}: #${purchase.id.slice(-6).toUpperCase()}`, 20, y);
    const orderDate = purchase.timestamp?.toDate
      ? format(purchase.timestamp.toDate(), 'dd/MM/yyyy')
      : format(new Date(), 'dd/MM/yyyy');
    doc.text(`${l.date}: ${orderDate}`, 20, y + 5);
    doc.text(`${l.store}: ${purchase.storeName}`, 20, y + 10);
    doc.text(`${l.supplier}: ${purchase.supplierName}`, 140, y);
    doc.text(`${l.status}: ${labels.resolvePurchaseStatus(purchase.status)}`, 140, y + 5);
    doc.text(`${l.preparedBy}: ${purchase.performedByName}`, 140, y + 10);

    autoTable(doc, {
      startY: y + 22,
      head: [[l.product, l.qty, l.unitCost, l.currency, l.totalFcfa]],
      body: purchase.items.map(i => [
        i.name, 
        i.quantity, 
        formatPdfNumber(i.unitCost),
        i.currency,
        formatMoney(i.quantity * i.unitCost * i.exchangeRate)
      ]),
      headStyles: { fillColor: [79, 70, 229] }
    });

    if (purchase.notes) {
      const notesY = getAutoTableFinalY(doc) + 8;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text(`${l.notes}:`, 20, notesY);
      doc.setFont('helvetica', 'normal');
      doc.text(purchase.notes, 20, notesY + 5, { maxWidth: 170 });
    }

    doc.save(`Commande_${purchase.id.slice(-6)}.pdf`);
  },

  async generateTransferNote(movement: StockMovement, labels: PrintLabels) {
    const l = labels.transfer;
    const doc = new jsPDF('p', 'mm', 'a4');
    doc.setFontSize(22);
    doc.text(`${getAppName()} - ${l.title}`, 20, 20);
    
    const y = 40;
    doc.setFontSize(10);
    doc.text(`${l.reference}: #${movement.id.slice(-6).toUpperCase()}`, 20, y);
    doc.text(`${l.date}: ${format(new Date(), 'dd/MM/yyyy')}`, 20, y + 5);
    doc.text(`${l.responsible}: ${movement.performedByName}`, 20, y + 10);
    
    autoTable(doc, {
      startY: y + 20,
      head: [[l.article, l.quantity, l.unit, l.source]],
      body: [[movement.productName, Math.abs(movement.delta), l.pieceUnit, movement.storeName]],
      headStyles: { fillColor: [59, 130, 246] }
    });

    doc.save(`Transfert_${movement.id.slice(-6)}.pdf`);
  },

  async generateStockHistoryReport(
    movements: StockMovement[],
    store: Store,
    labels: PrintLabels
  ) {
    const l = labels.stockHistory;
    const doc = new jsPDF('p', 'mm', 'a4');
    this.drawHeader(doc, l.title, store, labels.phoneShort);

    const formatTs = (ts: StockMovement['timestamp']) => {
      if (!ts) return '-';
      const date = ts?.toDate ? ts.toDate() : new Date(ts);
      return format(date, 'dd/MM/yyyy HH:mm');
    };

    const generatedAt = format(new Date(), 'dd/MM/yyyy HH:mm');
    const y = 50;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`${l.store} : ${store.name} (${store.code})`, 20, y);
    doc.text(`${l.generatedOn} ${generatedAt}`, 20, y + 5);
    doc.text(`${l.exportedMovements} : ${movements.length}`, 20, y + 10);

    autoTable(doc, {
      startY: y + 18,
      head: [[
        l.tableDate,
        l.tableProduct,
        l.tableType,
        l.tableDelta,
        l.tableFinalStock,
        l.tableAuthor,
        l.tableReason,
      ]],
      body: movements.map((m) => [
        formatTs(m.timestamp),
        m.productName,
        labels.resolveStockMovementType(m.type),
        m.delta > 0 ? `+${m.delta}` : String(m.delta),
        String(m.newStock),
        m.performedByName,
        m.reason || '-',
      ]),
      headStyles: { fillColor: [29, 217, 124] },
      styles: { fontSize: 8, cellPadding: 2 },
      columnStyles: {
        0: { cellWidth: 28 },
        1: { cellWidth: 40 },
        6: { cellWidth: 32 },
      },
    });

    const safeCode = store.code.replace(/[^a-zA-Z0-9-_]/g, '_');
    doc.save(`Historique_Flux_${safeCode}_${format(new Date(), 'yyyyMMdd')}.pdf`);
  },

  async generateCashAuditReport(
    sessions: CashSession[],
    store: Store,
    summary: { totalVariance: number; reliabilityPercent: number },
    labels: PrintLabels,
    formatMoney: PdfMoneyFormatter = defaultPdfMoney
  ) {
    formatMoney = resolvePdfMoney(formatMoney);
    const l = labels.cashAudit;
    const doc = new jsPDF('p', 'mm', 'a4');
    this.drawHeader(doc, l.title, store, labels.phoneShort);

    const formatTs = (ts: CashSession['openedAt']) => {
      if (!ts) return '-';
      const date = ts?.toDate ? ts.toDate() : new Date(ts);
      return format(date, 'dd/MM/yyyy HH:mm');
    };

    const closedSessions = sessions.filter((s) => s.status === 'CLOSED');
    const conformCount = closedSessions.filter((s) => {
      if (!s.variances) return true;
      return Object.values(s.variances).every((v) => v === 0);
    }).length;

    const generatedAt = format(new Date(), 'dd/MM/yyyy HH:mm');
    let y = 50;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`${l.store} : ${store.name} (${store.code})`, 20, y);
    doc.text(`${l.generatedOn} ${generatedAt}`, 20, y + 5);
    doc.text(
      `${l.sessionsAnalyzed} : ${sessions.length} (${closedSessions.length})`,
      20,
      y + 10
    );
    doc.text(
      `${l.globalVariance} : ${formatMoney(summary.totalVariance)} - ${l.reliability} : ${summary.reliabilityPercent}%`,
      20,
      y + 15
    );
    doc.text(`${l.conformClosures} : ${conformCount} / ${closedSessions.length || sessions.length}`, 20, y + 20);

    autoTable(doc, {
      startY: y + 26,
      head: [[
        l.tableOpened,
        l.tableClosed,
        l.tableCashier,
        l.tableExpected,
        l.tableActual,
        l.tableVariance,
        l.tableStatus,
      ]],
      body: sessions.map((s) => {
        const totalExpected = Object.values(s.expectedBalances).reduce((a, b) => a + b, 0);
        const totalActual = s.actualBalances
          ? Object.values(s.actualBalances).reduce((a, b) => a + b, 0)
          : totalExpected;
        const totalVar = s.variances
          ? Object.values(s.variances).reduce((a, b) => a + b, 0)
          : 0;
        const closedLabel = s.closedAt ? formatTs(s.closedAt) : '-';

        return [
          formatTs(s.openedAt),
          closedLabel,
          s.openedByName,
          formatPdfNumber(totalExpected),
          formatPdfNumber(totalActual),
          totalVar === 0 ? '0' : `${totalVar > 0 ? '+' : ''}${formatPdfNumber(totalVar)}`,
          labels.resolveCashSessionStatus(s, totalVar),
        ];
      }),
      headStyles: { fillColor: [29, 217, 124] },
      styles: { fontSize: 8, cellPadding: 2 },
      columnStyles: {
        0: { cellWidth: 26 },
        1: { cellWidth: 26 },
        2: { cellWidth: 28 },
      },
    });

    y = getAutoTableFinalY(doc) + 12;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(l.consolidatedSummary, 20, y);

    const lineTotals: Record<string, { expected: number; actual: number; variance: number }> = {};
    for (const method of PAYMENT_METHOD_IDS) {
      lineTotals[method] = { expected: 0, actual: 0, variance: 0 };
    }

    for (const s of closedSessions) {
      for (const method of PAYMENT_METHOD_IDS) {
        const expected = s.expectedBalances[method] ?? 0;
        const actual = s.actualBalances?.[method] ?? expected;
        const variance = s.variances?.[method] ?? actual - expected;
        lineTotals[method].expected += expected;
        lineTotals[method].actual += actual;
        lineTotals[method].variance += variance;
      }
    }

    autoTable(doc, {
      startY: y + 4,
      head: [[l.tableCashLine, l.tableExpectedCumul, l.tableActualCumul, l.tableVarianceCumul]],
      body: PAYMENT_METHOD_IDS.map((method) => {
        const totals = lineTotals[method];
        return [
          labels.resolvePaymentMethod(method),
          formatPdfNumber(totals.expected),
          formatPdfNumber(totals.actual),
          totals.variance === 0
            ? '0'
            : `${totals.variance > 0 ? '+' : ''}${formatPdfNumber(totals.variance)}`,
        ];
      }),
      headStyles: { fillColor: [29, 217, 124] },
      styles: { fontSize: 9, cellPadding: 2 },
    });

    const safeCode = store.code.replace(/[^a-zA-Z0-9-_]/g, '_');
    doc.save(`Audit_Caisse_${safeCode}_${format(new Date(), 'yyyyMMdd')}.pdf`);
  },

  async generateProductSheet(
    product: Product,
    stores: Store[],
    stockRecords: Record<string, DecomposedStock>,
    labels: PrintLabels,
    store?: Store | null,
    categoryName?: string,
    formatMoney: PdfMoneyFormatter = defaultPdfMoney
  ) {
    formatMoney = resolvePdfMoney(formatMoney);
    const l = labels.productSheet;
    const doc = new jsPDF('p', 'mm', 'a4');

    if (store) {
      this.drawHeader(doc, l.title, store, labels.phoneShort);
    } else {
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(29, 217, 124);
      doc.text(getAppName(), 20, 25);
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text(l.title, 20, 32);
      doc.setDrawColor(230, 230, 230);
      doc.line(20, 38, 190, 38);
    }

    let y = 50;
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(product.name, 20, y);
    y += 8;

    const normalized = normalizeProduct(product);
    const unitLabel = getProductUnitLabelFr(product.unit);
    const packLabel = normalized.packagingUnit
      ? getProductUnitLabelFr(normalized.packagingUnit)
      : '';
    const packagingLabel =
      normalized.unitsPerPack > 1
        ? l.formatPackagingValue(
            normalized.unitsPerPack,
            unitLabel,
            packLabel || l.packagingFallback
          )
        : '-';

    const infoRows: string[][] = [
      [l.sku, product.sku],
      [l.barcode, product.barcode || '-'],
      [l.category, categoryName || product.categoryId],
      [l.retailUnit, unitLabel],
      [l.packagingUnit, packLabel || '-'],
      [l.packagingContent, packagingLabel],
      [l.retailPrice, formatMoney(product.sellingPriceFCFA)],
      [l.wholesalePrice, formatMoney(normalized.wholesalePriceFCFA)],
      [l.purchasePrice, formatMoney(product.purchasePriceRef)],
      [l.manufacturingDate, product.manufacturingDate || '-'],
      [l.expirationDate, product.expirationDate || '-'],
      [l.lowStockThreshold, String(product.lowStockThreshold)],
      [l.status, product.active ? l.active : l.inactive],
    ];

    if (product.prices?.GNF) infoRows.push([l.priceGnf, formatPdfNumber(product.prices.GNF)]);
    if (product.prices?.USD) infoRows.push([l.priceUsd, `$${formatPdfNumber(product.prices.USD)}`]);
    if (product.prices?.EUR) infoRows.push([l.priceEur, `${formatPdfNumber(product.prices.EUR)} EUR`]);

    autoTable(doc, {
      startY: y,
      body: infoRows,
      theme: 'plain',
      styles: { fontSize: 10, cellPadding: 2 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 55 } },
    });

    y = getAutoTableFinalY(doc) + 12;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(l.stockByStore, 20, y);

    autoTable(doc, {
      startY: y + 4,
      head: [[l.tableStore, l.tableCode, l.tableQuantity, l.tableUnit]],
      body: stores.map((s) => {
        const record = stockRecords[s.id] ?? { packagingQty: 0, detailQty: 0, quantity: 0 };
        const hasPackaging = normalized.unitsPerPack > 1 && !!normalized.packagingUnit;
        const quantityLabel = hasPackaging
          ? `${formatDecomposedStockLabel(record, product, ' + ', getProductUnitLabelFr)} (${record.quantity} ${unitLabel})`
          : String(record.quantity);
        return [s.name, s.code, quantityLabel, unitLabel];
      }),
      headStyles: { fillColor: [29, 217, 124] },
    });

    y = getAutoTableFinalY(doc) + 10;
    try {
      const qrDataUrl = await QRCode.toDataURL(product.id);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(l.qrCode, 20, y);
      doc.addImage(qrDataUrl, 'PNG', 20, y + 3, 35, 35);
      doc.text(`ID: ${product.id}`, 60, y + 20);
    } catch {
      // QR optionnel
    }

    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`${l.generatedOn} ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 20, 285);

    const safeSku = product.sku.replace(/[^a-zA-Z0-9-_]/g, '_');
    doc.save(`Fiche_${safeSku}.pdf`);
  },

  async generateSalesReport(
    sales: Sale[],
    store: Store | null,
    meta: {
      startDate: string;
      endDate: string;
      storeLabel: string;
    },
    labels: PrintLabels,
    formatMoney: PdfMoneyFormatter = defaultPdfMoney
  ) {
    formatMoney = resolvePdfMoney(formatMoney);
    const l = labels.salesReport;
    const doc = new jsPDF('p', 'mm', 'a4');

    if (store) {
      this.drawHeader(doc, l.title, store, labels.phoneShort);
    } else {
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(29, 217, 124);
      doc.text(getAppName(), 20, 25);
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text(l.title, 20, 32);
      doc.setDrawColor(230, 230, 230);
      doc.line(20, 38, 190, 38);
    }

    const y = 50;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    doc.text(`${l.period} : ${meta.startDate} → ${meta.endDate}`, 20, y);
    doc.text(`${l.store} : ${meta.storeLabel}`, 20, y + 5);
    doc.text(`${l.exportedSales} : ${sales.length}`, 20, y + 10);
    doc.text(
      `${l.revenue} : ${formatMoney(sales.reduce((sum, s) => sum + s.total, 0))}`,
      20,
      y + 15
    );

    const formatSaleDate = (sale: Sale) => {
      if (!sale.timestamp?.toDate) return '-';
      return format(sale.timestamp.toDate(), 'dd/MM/yyyy HH:mm');
    };

    autoTable(doc, {
      startY: y + 22,
      head: [[
        l.tableDate,
        l.tableNumber,
        l.tableClient,
        l.tablePhone,
        l.tableSeller,
        l.tableTotal,
        l.tableStatus,
      ]],
      body: sales.map((sale) => [
        formatSaleDate(sale),
        `#${sale.id.slice(-6).toUpperCase()}`,
        sale.clientName && isRegisteredSaleClient(sale) ? sale.clientName : l.walkIn,
        isRegisteredSaleClient(sale) ? sale.clientPhone || '-' : '-',
        sale.sellerName,
        formatMoney(sale.total),
        labels.resolveSaleStatus(sale.status),
      ]),
      headStyles: { fillColor: [29, 217, 124] },
      styles: { fontSize: 8, cellPadding: 2 },
      columnStyles: {
        0: { cellWidth: 28 },
        2: { cellWidth: 32 },
        3: { cellWidth: 24 },
      },
    });

    doc.save(`Rapport_Ventes_${format(new Date(), 'yyyyMMdd')}.pdf`);
  },

  drawHeader(doc: jsPDF, title: string, store: Store, phoneShort: string) {
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(29, 217, 124);
    doc.text(getAppName(), 20, 25);
    
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(title, 20, 32);
    
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text(store.name, 190, 20, { align: 'right' });
    doc.text(store.address, 190, 25, { align: 'right' });
    doc.text(`${phoneShort}: ${store.phone}`, 190, 30, { align: 'right' });
    
    doc.setDrawColor(230, 230, 230);
    doc.line(20, 38, 190, 38);
  }
};
