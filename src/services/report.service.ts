
import { 
  collection, 
  getDocs, 
  query, 
  where,
  limit,  
  Timestamp,
  QueryConstraint,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { Sale, Product, Client, Supplier, StockLevel } from "@/lib/types";
import { isSaleCountedInRevenue, isSaleInDateRange } from "@/lib/sale-utils";
import {
  FIRESTORE_IN_QUERY_LIMIT,
  type ReportStoreFilter,
} from "@/lib/report-utils";

const EMPTY_SALES_TOTALS = { revenue: 0, discount: 0, debt: 0, count: 0 };

function applyStoreFilter(
  constraints: QueryConstraint[],
  filter?: ReportStoreFilter
) {
  if (filter?.storeId) {
    constraints.push(where("storeId", "==", filter.storeId));
    return;
  }
  const ids = filter?.storeIds?.filter(Boolean) ?? [];
  if (ids.length === 1) {
    constraints.push(where("storeId", "==", ids[0]));
    return;
  }
  if (ids.length > 1) {
    constraints.push(where("storeId", "in", ids.slice(0, FIRESTORE_IN_QUERY_LIMIT)));
  }
}

function scopedStoreIds(filter?: ReportStoreFilter): string[] | null {
  if (filter?.storeId) return [filter.storeId];
  if (filter?.storeIds?.length) return filter.storeIds;
  return null;
}

export const ReportService = {
  /**
   * Récupère les ventes filtrées pour le reporting.
   * Boutique + dates : le filtre dates est appliqué côté client.
   * Un `where(storeId) + where(timestamp)` exigerait un index composite
   * non déployé, et échoue en permission-denied / failed-precondition pour un vendeur.
   */
  async getSalesReport(params: { 
    startDate: Date, 
    endDate: Date, 
  } & ReportStoreFilter) {
    const hasStoreScope = Boolean(params.storeId || params.storeIds?.length);
    const constraints: QueryConstraint[] = [];

    applyStoreFilter(constraints, params);

    if (!hasStoreScope) {
      constraints.push(where("timestamp", ">=", Timestamp.fromDate(params.startDate)));
      constraints.push(where("timestamp", "<=", Timestamp.fromDate(params.endDate)));
    }

    const q = query(collection(db, "sales"), ...constraints);
    const snap = await getDocs(q);
    let sales = snap.docs.map(doc => doc.data() as Sale);

    if (hasStoreScope) {
      sales = sales.filter((sale) =>
        isSaleInDateRange(sale, params.startDate, params.endDate)
      );
    }

    sales.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));

    const counted = sales.filter(isSaleCountedInRevenue);
    const totals = counted.reduce((acc, s) => ({
      revenue: acc.revenue + s.total,
      discount: acc.discount + (s.discount || 0),
      debt: acc.debt + (s.debtAmount || 0),
      count: acc.count + 1
    }), { ...EMPTY_SALES_TOTALS });

    return { sales, totals };
  },

  emptySalesReport() {
    return { sales: [] as Sale[], totals: { ...EMPTY_SALES_TOTALS } };
  },

  /**
   * Analyse complète des stocks et valorisation (P3 État stock)
   */
  async getInventoryReport(filter?: ReportStoreFilter) {
    const stockConstraints: QueryConstraint[] = [];
    applyStoreFilter(stockConstraints, filter);

    const stocksQuery = stockConstraints.length > 0
      ? query(collection(db, "stocks"), ...stockConstraints)
      : collection(db, "stocks");

    const [productsSnap, stocksSnap] = await Promise.all([
      getDocs(query(collection(db, "products"), where("active", "==", true))),
      getDocs(stocksQuery)
    ]);

    const products = productsSnap.docs.map(doc => doc.data() as Product);
    const stocks = stocksSnap.docs.map(doc => doc.data() as StockLevel);
    const storeIds = scopedStoreIds(filter);

    const report = products.map(p => {
      const relevantStocks = storeIds
        ? stocks.filter(s => s.productId === p.id && storeIds.includes(s.storeId))
        : stocks.filter(s => s.productId === p.id);
      
      const totalQty = relevantStocks.reduce((sum, s) => sum + s.quantity, 0);
      const valuation = totalQty * (p.purchasePriceRef || 0);

      return {
        id: p.id,
        name: p.name,
        sku: p.sku,
        category: p.categoryId,
        stock: totalQty,
        unit: p.unit,
        unitCost: p.purchasePriceRef || 0,
        valuation
      };
    });

    const totalValuation = report.reduce((sum, item) => sum + item.valuation, 0);

    return { 
      items: report.sort((a, b) => b.valuation - a.valuation), 
      totalValuation 
    };
  },

  /**
   * Top Produits les plus vendus (P3 Top produits)
   */
  async getTopProducts(filter?: ReportStoreFilter, limitCount = 10) {
    const constraints: QueryConstraint[] = [];
    applyStoreFilter(constraints, filter);
    constraints.push(limit(300));

    const q = query(collection(db, "sales"), ...constraints);
    
    const snap = await getDocs(q);
    const productSales: Record<string, { name: string, qty: number, revenue: number }> = {};

    snap.docs.forEach(doc => {
      const sale = doc.data() as Sale;
      sale.items.forEach(item => {
        if (!productSales[item.productId]) {
          productSales[item.productId] = { name: item.name, qty: 0, revenue: 0 };
        }
        productSales[item.productId].qty += item.retailQuantity ?? item.quantity;
        productSales[item.productId].revenue += item.total;
      });
    });

    return Object.entries(productSales)
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, limitCount);
  },

  /**
   * Consolidation des dettes et créances (P3 Bilan consolidé)
   */
  async getFinanceConsolidation() {
    const [clientsSnap, suppliersSnap] = await Promise.all([
      getDocs(query(collection(db, "clients"), where("currentDebt", ">", 0))),
      getDocs(query(collection(db, "suppliers"), where("currentDebt", ">", 0)))
    ]);

    const clients = clientsSnap.docs.map(doc => doc.data() as Client);
    const suppliers = suppliersSnap.docs.map(doc => doc.data() as Supplier);

    const totalClientDebt = clients.reduce((sum, c) => sum + (c.currentDebt || 0), 0);
    const totalSupplierDebt = suppliers.reduce((sum, s) => sum + (s.currentDebt || 0), 0);

    return {
      clients: clients.sort((a, b) => b.currentDebt - a.currentDebt),
      suppliers: suppliers.sort((a, b) => b.currentDebt - a.currentDebt),
      summary: {
        totalClientDebt,
        totalSupplierDebt,
        netBalance: totalClientDebt - totalSupplierDebt
      }
    };
  }
};
