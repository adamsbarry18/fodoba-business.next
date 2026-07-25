
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc,  
  query, 
  where, 
  orderBy, 
  limit, 
  serverTimestamp,
  runTransaction,
  updateDoc,
  DocumentSnapshot,
  startAfter,
  type QueryConstraint
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { Purchase, UserProfile, Product, Supplier, StockLevel } from "@/lib/types";
import { getLandedCostUnit } from "@/lib/purchase-utils";
import { stripUndefined } from "@/lib/firestore-utils";
import {
  applyPurchaseQuantityToDecomposedStock,
  buildStockLevelPayload,
  normalizeStockLevel,
} from "@/lib/stock-utils";
import { getRetailUnitsPerPack, normalizeProduct } from "@/lib/product-utils";

const COLLECTION_NAME = "purchases";

export const PurchaseService = {
  async createPurchase(data: Omit<Purchase, "id" | "timestamp">) {
    const newDocRef = doc(collection(db, COLLECTION_NAME));
    const purchase: Purchase = {
      ...data,
      id: newDocRef.id,
      timestamp: serverTimestamp(),
    };
    await setDoc(newDocRef, stripUndefined(purchase));
    return purchase;
  },

  async getPurchase(id: string) {
    const docRef = doc(db, COLLECTION_NAME, id);
    const snap = await getDoc(docRef);
    return snap.exists() ? (snap.data() as Purchase) : null;
  },

  async updatePurchase(
    id: string,
    data: Partial<
      Pick<
        Purchase,
        | "supplierId"
        | "supplierName"
        | "items"
        | "expenses"
        | "subtotalFCFA"
        | "expensesTotalFCFA"
        | "totalFCFA"
        | "status"
        | "notes"
      >
    >
  ) {
    const existing = await this.getPurchase(id);
    if (!existing) throw new Error("Commande introuvable");
    if (existing.status !== "DRAFT" && existing.status !== "ORDERED") {
      throw new Error("Seules les commandes non réceptionnées peuvent être modifiées");
    }
    if (data.status && data.status !== "DRAFT" && data.status !== "ORDERED") {
      throw new Error("Statut de commande invalide");
    }

    const docRef = doc(db, COLLECTION_NAME, id);
    await updateDoc(docRef, stripUndefined(data));
  },

  async listPurchases(filters?: { storeId?: string; supplierId?: string }, pageSize = 20, lastVisible?: DocumentSnapshot) {
    const constraints: QueryConstraint[] = [];

    if (filters?.storeId) {
      constraints.push(where("storeId", "==", filters.storeId));
    }
    if (filters?.supplierId) {
      constraints.push(where("supplierId", "==", filters.supplierId));
    }

    // Retrait du orderBy si filtres présents pour éviter l'exigence d'index composites
    if (constraints.length === 0) {
      constraints.push(orderBy("timestamp", "desc"));
    }

    if (lastVisible) {
      constraints.push(startAfter(lastVisible));
    }

    constraints.push(limit(pageSize));

    const q = query(collection(db, COLLECTION_NAME), ...constraints);
    const snap = await getDocs(q);
    const purchases = snap.docs.map(doc => doc.data() as Purchase);

    // Tri manuel si nécessaire
    if (constraints.length > 0 && !constraints.some(c => c.type === 'orderBy')) {
      purchases.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
    }

    return {
      purchases,
      lastVisible: snap.docs[snap.docs.length - 1],
    };
  },

  async validateReception(purchaseId: string, user: UserProfile) {
    const purchaseRef = doc(db, COLLECTION_NAME, purchaseId);
    const purchaseSnap = await getDoc(purchaseRef);
    if (!purchaseSnap.exists()) throw new Error("Commande introuvable");

    await runTransaction(db, async (transaction) => {
      const purchaseSnapInTx = await transaction.get(purchaseRef);
      if (!purchaseSnapInTx.exists()) throw new Error("Commande introuvable");

      const purchase = purchaseSnapInTx.data() as Purchase;
      if (purchase.status === "RECEIVED") {
        throw new Error("Cette commande a déjà été réceptionnée");
      }
      if (purchase.status !== "ORDERED") {
        throw new Error("Seules les commandes validées peuvent être réceptionnées");
      }
      if (purchase.items.length === 0) {
        throw new Error("Cette commande ne contient aucun article");
      }

      const supplierRef = doc(db, "suppliers", purchase.supplierId);
      const supplierSnap = await transaction.get(supplierRef);
      if (!supplierSnap.exists()) throw new Error("Fournisseur introuvable");
      const supplier = supplierSnap.data() as Supplier;

      // Phase 1 - toutes les lectures avant toute écriture (contrainte Firestore)
      const itemContexts: Array<{
        item: Purchase["items"][number];
        productRef: ReturnType<typeof doc>;
        productSnap: Awaited<ReturnType<typeof transaction.get>>;
        stockRef: ReturnType<typeof doc>;
        stockSnap: Awaited<ReturnType<typeof transaction.get>>;
      }> = [];

      for (const item of purchase.items) {
        const productRef = doc(db, "products", item.productId);
        const productSnap = await transaction.get(productRef);

        const stockId = `${purchase.storeId}_${item.productId}`;
        const stockRef = doc(db, "stocks", stockId);
        const stockSnap = await transaction.get(stockRef);

        itemContexts.push({ item, productRef, productSnap, stockRef, stockSnap });
      }

      // Phase 2 - toutes les écritures
      for (const { item, productRef, productSnap, stockRef, stockSnap } of itemContexts) {
        if (!productSnap.exists() || item.quantity <= 0) continue;

        const product = productSnap.data() as Product;
        const normalized = normalizeProduct(product);
        const landedCostUnit = getLandedCostUnit(item, purchase);

        const oldPMP = product.purchasePriceRef || landedCostUnit;
        const newPMP = (oldPMP + landedCostUnit) / 2;

        transaction.update(productRef, { purchasePriceRef: newPMP });

        const previous = normalizeStockLevel(
          stockSnap.exists() ? (stockSnap.data() as StockLevel) : null,
          getRetailUnitsPerPack(normalized)
        );
        const next = applyPurchaseQuantityToDecomposedStock(previous, product, item.quantity);

        transaction.set(
          stockRef,
          {
            ...buildStockLevelPayload(item.productId, purchase.storeId, next),
            lastUpdated: serverTimestamp(),
          },
          { merge: true }
        );

        const moveRef = doc(collection(db, "inventory_movements"));
        transaction.set(moveRef, {
          id: moveRef.id,
          productId: item.productId,
          productName: item.name,
          storeId: purchase.storeId,
          storeName: purchase.storeName,
          type: "PURCHASE",
          delta: next.quantity - previous.quantity,
          previousStock: previous.quantity,
          newStock: next.quantity,
          reason: `Réception achat #${purchase.id.slice(-6)}`,
          performedBy: user.uid,
          performedByName: `${user.firstName} ${user.lastName}`,
          timestamp: serverTimestamp(),
          relatedDocId: purchase.id,
        });
      }

      transaction.update(supplierRef, {
        currentDebt: supplier.currentDebt + purchase.totalFCFA,
      });

      transaction.update(purchaseRef, {
        status: "RECEIVED",
        receivedAt: serverTimestamp(),
        receivedBy: user.uid,
      });
    });
  },
};
