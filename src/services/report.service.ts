
import { 
  collection, 
  getDocs, 
  query, 
  where,
  limit,  
  Timestamp
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { Sale, Product, Client, Supplier, StockLevel } from "@/lib/types";
import { isSaleCountedInRevenue } from "@/lib/sale-utils";

export const ReportService = {
  /**
   * Récupère les ventes filtrées pour le reporting.
   */
  async getSalesReport(params: { 
    startDate: Date, 
    endDate: Date, 
    storeId?: string 
  }) {
    const constraints = [
      where("timestamp", ">=", Timestamp.fromDate(params.startDate)),
      where("timestamp", "<=", Timestamp.fromDate(params.endDate))
    ];

    if (params.storeId && params.storeId !== "all") {
      constraints.push(where("storeId", "==", params.storeId));
    }

    const q = query(collection(db, "sales"), ...constraints);
    const snap = await getDocs(q);
    const sales = snap.docs.map(doc => doc.data() as Sale);

    sales.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));

    const counted = sales.filter(isSaleCountedInRevenue);
    const totals = counted.reduce((acc, s) => ({
      revenue: acc.revenue + s.total,
      discount: acc.discount + (s.discount || 0),
      debt: acc.debt + (s.debtAmount || 0),
      count: acc.count + 1
    }), { revenue: 0, discount: 0, debt: 0, count: 0 });

    return { sales, totals };
  },

  /**
   * Analyse complète des stocks et valorisation (P3 État stock)
   */
  async getInventoryReport(storeId?: string) {
    const stocksQuery = storeId && storeId !== "all"
      ? query(collection(db, "stocks"), where("storeId", "==", storeId))
      : collection(db, "stocks");

    const [productsSnap, stocksSnap] = await Promise.all([
      getDocs(query(collection(db, "products"), where("active", "==", true))),
      getDocs(stocksQuery)
    ]);

    const products = productsSnap.docs.map(doc => doc.data() as Product);
    const stocks = stocksSnap.docs.map(doc => doc.data() as StockLevel);

    const report = products.map(p => {
      const relevantStocks = storeId && storeId !== "all" 
        ? stocks.filter(s => s.productId === p.id && s.storeId === storeId)
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
  async getTopProducts(storeId?: string, limitCount = 10) {
    const constraints = [];
    if (storeId && storeId !== "all") {
      constraints.push(where("storeId", "==", storeId));
    }
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
