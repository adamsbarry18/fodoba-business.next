
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  query, 
  orderBy, 
  serverTimestamp,
  where,
  limit,
  startAfter,
  writeBatch,
  DocumentSnapshot,
  type QueryConstraint
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { Product, StockLevel } from "@/lib/types";
import { stripUndefined } from "@/lib/firestore-utils";
import {
  buildDecomposedStock,
  buildStockLevelPayload,
  normalizeStockLevel,
  applyRetailQuantityIn,
  applyRetailQuantityOut,
  type DecomposedStock,
} from "@/lib/stock-utils";
import { getRetailUnitsPerPack } from "@/lib/product-utils";
import { AppNotificationHelper } from "@/lib/notifications/app-notification-helper";

const COLLECTION_NAME = "products";
const STOCKS_COLLECTION = "stocks";

function buildProductPayload(
  id: string,
  data: Omit<Product, "id" | "createdAt">
) {
  return stripUndefined({
    id,
    name: data.name.trim(),
    sku: data.sku.trim(),
    barcode: data.barcode?.trim() || undefined,
    categoryId: data.categoryId,
    imageUrl: data.imageUrl || undefined,
    packagingUnit: data.packagingUnit || undefined,
    unit: data.unit,
    unitsPerPack: data.unitsPerPack ?? 1,
    retailQtyFactor: data.retailQtyFactor ?? 1,
    conditionnement: data.conditionnement || undefined,
    purchasePriceRef: data.purchasePriceRef ?? 0,
    wholesalePriceFCFA: data.wholesalePriceFCFA ?? 0,
    sellingPriceFCFA: data.sellingPriceFCFA ?? 0,
    manufacturingDate: data.manufacturingDate || undefined,
    expirationDate: data.expirationDate || undefined,
    prices: data.prices
      ? stripUndefined({
          GNF: data.prices.GNF,
          USD: data.prices.USD,
          EUR: data.prices.EUR,
        })
      : undefined,
    lowStockThreshold: data.lowStockThreshold ?? 10,
    active: data.active ?? true,
    createdAt: serverTimestamp(),
  });
}

export const ProductService = {
  async createProduct(data: Omit<Product, "id" | "createdAt">) {
    if (!db) {
      throw new Error("Base de données non configurée. Vérifiez NEXT_PUBLIC_FIREBASE_*.");
    }

    const newDocRef = doc(collection(db, COLLECTION_NAME));
    const payload = buildProductPayload(newDocRef.id, data);
    await setDoc(newDocRef, payload);

    const snap = await getDoc(newDocRef);
    if (!snap.exists()) {
      throw new Error("Le produit n'a pas pu être enregistré dans Firestore.");
    }

    const product = { id: newDocRef.id, ...snap.data() } as Product;
    void AppNotificationHelper.notifyProductExpiration({ product });
    return product;
  },

  async createProductWithInitialStock(
    data: Omit<Product, "id" | "createdAt">,
    options: {
      storeId: string
      initialStockPackaging?: number
      detailStock?: number
    }
  ) {
    if (!db) {
      throw new Error("Base de données non configurée. Vérifiez NEXT_PUBLIC_FIREBASE_*.");
    }

    const productRef = doc(collection(db, COLLECTION_NAME));
    const productPayload = buildProductPayload(productRef.id, data);
    const decomposed = buildDecomposedStock(
      options.initialStockPackaging ?? 0,
      options.detailStock ?? 0,
      data.unitsPerPack ?? 1,
      data.retailQtyFactor ?? 1
    );
    const stockId = `${options.storeId}_${productRef.id}`;
    const stockRef = doc(db, STOCKS_COLLECTION, stockId);
    const stockPayload = {
      ...buildStockLevelPayload(productRef.id, options.storeId, decomposed),
      lastUpdated: serverTimestamp(),
    };

    // Écriture atomique produit + stock boutique
    const batch = writeBatch(db);
    batch.set(productRef, productPayload);
    batch.set(stockRef, stockPayload);
    await batch.commit();

    const snap = await getDoc(productRef);
    if (!snap.exists()) {
      throw new Error("Le produit n'a pas pu être enregistré dans Firestore.");
    }

    const product = { id: productRef.id, ...snap.data() } as Product;
    void AppNotificationHelper.notifyProductExpiration({
      product,
      storeId: options.storeId,
    });

    return product;
  },

  /** Enregistre l'image dans public/uploads/ et retourne l'URL relative (ex. /uploads/products/…). */
  async uploadProductImage(productId: string, file: File): Promise<string> {
    const maxSize = 4.5 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new Error("Image too large (max 4.5 MB)");
    }
    if (!file.type.startsWith("image/")) {
      throw new Error("File must be an image");
    }

    const formData = new FormData();
    formData.append("productId", productId);
    formData.append("file", file);

    const response = await fetch("/api/uploads/product-image", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(body?.message || "Upload failed");
    }

    const { url } = (await response.json()) as { url: string };
    return url;
  },

  async updateProduct(id: string, data: Partial<Product>, options?: { storeId?: string }) {
    const docRef = doc(db, COLLECTION_NAME, id);
    await updateDoc(docRef, stripUndefined(data));
    const product = await this.getProduct(id);
    if (product) {
      void AppNotificationHelper.notifyProductExpiration({
        product,
        storeId: options?.storeId,
      });
    }
  },

  async getProduct(id: string) {
    const docRef = doc(db, COLLECTION_NAME, id);
    const snap = await getDoc(docRef);
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as Product) : null;
  },

  /**
   * Catalogue des produits (tri nom). Limite de sécurité maxLimit (500 par défaut).
   */
  async listAllProducts(maxLimit = 500): Promise<Product[]> {
    const q = query(
      collection(db, COLLECTION_NAME), 
      orderBy("name", "asc"),
      limit(maxLimit)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Product));
  },

  /**
   * Version paginée (évite les index composites si filtres).
   */
  async listProducts(filters?: { categoryId?: string; active?: boolean }, pageSize = 25, lastVisible?: DocumentSnapshot) {
    const constraints: QueryConstraint[] = [];

    // Filtres d'égalité simples (ne nécessitent pas d'index si pas de orderBy sur un autre champ)
    if (filters?.categoryId) {
      constraints.push(where("categoryId", "==", filters.categoryId));
    }
    if (filters?.active !== undefined) {
      constraints.push(where("active", "==", filters.active));
    }

    // On n'ajoute le orderBy QUE s'il n'y a pas d'autres filtres pour éviter l'erreur d'index manquant
    if (constraints.length === 0) {
      constraints.push(orderBy("name", "asc"));
    }
    
    if (lastVisible) {
      constraints.push(startAfter(lastVisible));
    }
    
    constraints.push(limit(pageSize));

    const q = query(collection(db, COLLECTION_NAME), ...constraints);
    const snap = await getDocs(q);

    const products = snap.docs.map(
      (d) => ({ id: d.id, ...d.data() }) as Product
    );

    // Tri en mémoire si on a des filtres (car le orderBy a été omis de la requête)
    const hasOrderBy = constraints.some(
      (c) =>
        c &&
        typeof c === "object" &&
        "type" in c &&
        (c as { type?: string }).type === "orderBy"
    );
    if (!hasOrderBy) {
      products.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    }
    
    return {
      products,
      lastVisible: snap.docs[snap.docs.length - 1],
    };
  },

  async searchProducts(searchTerm: string) {
    if (!searchTerm) return [];
    const term = searchTerm.toLowerCase();
    const q = query(
      collection(db, COLLECTION_NAME), 
      where("active", "==", true),
      limit(50)
    );
    const snap = await getDocs(q);
    const all = snap.docs.map(doc => doc.data() as Product);
    return all.filter(p => 
      p.name.toLowerCase().includes(term) || 
      p.sku.toLowerCase().includes(term) || 
      p.barcode?.toLowerCase().includes(term)
    );
  },

  /** Recherche exacte code-barres / SKU / ID produit (scan). */
  async findProductByCode(code: string): Promise<Product | null> {
    const trimmed = code.trim();
    if (!trimmed) return null;

    const byBarcode = query(
      collection(db, COLLECTION_NAME),
      where("active", "==", true),
      where("barcode", "==", trimmed),
      limit(1)
    );
    const barcodeSnap = await getDocs(byBarcode);
    if (!barcodeSnap.empty) {
      return barcodeSnap.docs[0].data() as Product;
    }

    const bySku = query(
      collection(db, COLLECTION_NAME),
      where("active", "==", true),
      where("sku", "==", trimmed),
      limit(1)
    );
    const skuSnap = await getDocs(bySku);
    if (!skuSnap.empty) {
      return skuSnap.docs[0].data() as Product;
    }

    const idRef = doc(db, COLLECTION_NAME, trimmed);
    const idSnap = await getDoc(idRef);
    if (idSnap.exists()) {
      const product = idSnap.data() as Product;
      if (product.active) return product;
    }

    const fuzzy = await this.searchProducts(trimmed);
    const exactFuzzy = fuzzy.find(
      (p) =>
        p.barcode?.toLowerCase() === trimmed.toLowerCase() ||
        p.sku.toLowerCase() === trimmed.toLowerCase() ||
        p.id === trimmed
    );
    return exactFuzzy ?? fuzzy[0] ?? null;
  },

  async getStockLevel(productId: string, storeId: string): Promise<number> {
    const record = await this.getStockRecord(productId, storeId);
    return record?.quantity ?? 0;
  },

  async getStockRecord(
    productId: string,
    storeId: string,
    unitsPerPack = 1
  ): Promise<DecomposedStock> {
    const stockId = `${storeId}_${productId}`;
    const docRef = doc(db, STOCKS_COLLECTION, stockId);
    const snap = await getDoc(docRef);
    return normalizeStockLevel(
      snap.exists() ? (snap.data() as StockLevel) : null,
      unitsPerPack
    );
  },

  async getStockRecordsForProducts(
    products: Array<{
      id: string
      unitsPerPack?: number
      retailQtyFactor?: number
    }>,
    storeId: string
  ): Promise<Record<string, DecomposedStock>> {
    const results: Record<string, DecomposedStock> = {};
    await Promise.all(
      products.map(async (p) => {
        results[p.id] = await this.getStockRecord(
          p.id,
          storeId,
          getRetailUnitsPerPack(p)
        );
      })
    );
    return results;
  },

  async getStockLevelsForProducts(productIds: string[], storeId: string): Promise<Record<string, number>> {
    const results: Record<string, number> = {};
    await Promise.all(productIds.map(async (pid) => {
      results[pid] = await this.getStockLevel(pid, storeId);
    }));
    return results;
  },

  async setStockDecomposed(
    productId: string,
    storeId: string,
    packagingQty: number,
    detailQty: number,
    unitsPerPack = 1,
    retailQtyFactor = 1
  ) {
    const decomposed = buildDecomposedStock(
      packagingQty,
      detailQty,
      unitsPerPack,
      retailQtyFactor
    );
    const stockId = `${storeId}_${productId}`;
    const docRef = doc(db, STOCKS_COLLECTION, stockId);
    await setDoc(docRef, {
      ...buildStockLevelPayload(productId, storeId, decomposed),
      lastUpdated: serverTimestamp(),
    });
  },

  async setStockLevel(productId: string, storeId: string, quantity: number) {
    const stockId = `${storeId}_${productId}`;
    const docRef = doc(db, STOCKS_COLLECTION, stockId);
    const stock: StockLevel = {
      productId,
      storeId,
      quantity: Math.max(0, quantity),
      lastUpdated: serverTimestamp(),
    };
    await setDoc(docRef, stock);
  },

  async updateStockLevel(productId: string, storeId: string, delta: number) {
    if (delta === 0) return;

    const product = await this.getProduct(productId);
    const ratio = product ? getRetailUnitsPerPack(product) : 1;
    const previous = await this.getStockRecord(productId, storeId, ratio);
    const next =
      delta > 0
        ? applyRetailQuantityIn(previous, delta, ratio)
        : applyRetailQuantityOut(previous, -delta, ratio);

    const stockId = `${storeId}_${productId}`;
    const docRef = doc(db, STOCKS_COLLECTION, stockId);
    await setDoc(docRef, {
      ...buildStockLevelPayload(productId, storeId, next),
      lastUpdated: serverTimestamp(),
    });
  }
};
