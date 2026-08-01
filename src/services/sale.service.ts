import { 
  collection, 
  doc, 
  getDoc,
  runTransaction,
  serverTimestamp,
  query,
  where,
  orderBy,
  getDocs,
  limit,
  startAfter,
  updateDoc,
  DocumentSnapshot,
  type QueryConstraint
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { Sale, SaleItem, UserProfile, Client, StockLevel, Store, Product } from "@/lib/types";
import { getSaleItemRetailQuantity, getSaleQuantityUnit } from "@/lib/pos-utils";
import { getRetailUnitsPerPack, normalizeProduct } from "@/lib/product-utils";
import {
  applySaleItemsToDecomposedStock,
  applySaleReturnItemsToDecomposedStock,
  buildStockLevelPayload,
  normalizeStockLevel,
  type DecomposedStock,
} from "@/lib/stock-utils";
import { stripUndefined } from "@/lib/firestore-utils";
import { CashService } from "./cash.service";
import { AppNotificationHelper } from "@/lib/notifications/app-notification-helper";

const COLLECTION_NAME = "sales";
const STOCKS_COLLECTION = "stocks";
const MOVEMENTS_COLLECTION = "inventory_movements";
const CLIENTS_COLLECTION = "clients";

type ProcessSaleParams = {
  store: Store
  user: UserProfile
  items: SaleItem[]
  clientId?: string
  payments: { method: string; amount: number }[]
  discount: number
  subtotal: number
  total: number
  debtAmount: number
  replacesSaleId?: string
}

export type CancelSaleResult = {
  sale: Sale
  debtReversed: number
  debtNotReversed: number
}

export const SaleService = {
  async getSale(id: string): Promise<Sale | null> {
    const snap = await getDoc(doc(db, COLLECTION_NAME, id));
    if (!snap.exists()) return null;
    return snap.data() as Sale;
  },

  async processSale(params: ProcessSaleParams) {
    const {
      store,
      user,
      items,
      clientId,
      payments,
      discount,
      subtotal,
      total,
      debtAmount,
      replacesSaleId,
    } = params;

    if (!items.length) {
      throw new Error("Le panier est vide.");
    }

    // 1. Récupérer la session de caisse AVANT la transaction (interdiction de query dans runTransaction)
    const session = await CashService.getActiveSession(store.id);
    if (!session) throw new Error("Aucune session de caisse ouverte pour cette boutique.");

    const result = await runTransaction(db, async (transaction) => {
      // --- ÉTAPE 1 : TOUTES LES LECTURES (READS) ---
      
      // Lecture du client
      let client: Client | null = null;
      if (clientId && clientId !== "none") {
        const clientRef = doc(db, CLIENTS_COLLECTION, clientId);
        const clientSnap = await transaction.get(clientRef);
        if (!clientSnap.exists()) throw new Error("Client introuvable");
        client = clientSnap.data() as Client;
      }

      const productIds = [...new Set(items.map((item) => item.productId))];
      const productRefs = productIds.map((productId) => doc(db, "products", productId));
      const stockRefs = productIds.map((productId) =>
        doc(db, STOCKS_COLLECTION, `${store.id}_${productId}`)
      );

      const productSnaps = await Promise.all(productRefs.map((ref) => transaction.get(ref)));
      const stockSnaps = await Promise.all(stockRefs.map((ref) => transaction.get(ref)));

      const productsById = new Map<string, Product>();
      productIds.forEach((productId, index) => {
        const snap = productSnaps[index];
        if (!snap.exists()) {
          throw new Error(`Produit introuvable : ${productId}`);
        }
        productsById.set(productId, snap.data() as Product);
      });

      const stockByProductId = new Map<string, DecomposedStock>();
      productIds.forEach((productId, index) => {
        const snap = stockSnaps[index];
        const product = productsById.get(productId)!;
        const normalized = normalizeProduct(product);
        stockByProductId.set(
          productId,
          normalizeStockLevel(
            snap.exists() ? (snap.data() as StockLevel) : null,
            getRetailUnitsPerPack(normalized)
          )
        );
      });

      // --- ÉTAPE 2 : LOGIQUE ET VALIDATIONS ---

      if (client && debtAmount > 0 && client.creditCeiling > 0) {
        if (client.currentDebt + debtAmount > client.creditCeiling) {
          throw new Error(`Plafond de crédit dépassé pour ${client.name}. Max autorisé: ${client.creditCeiling} FCFA`);
        }
      }

      const enrichedItems: SaleItem[] = items.map((item) => {
        const product = productsById.get(item.productId);
        if (!product) {
          throw new Error(`Produit introuvable : ${item.name}`);
        }
        const tier = item.priceTier ?? "retail";
        const retailQuantity = getSaleItemRetailQuantity(item, product);
        if (retailQuantity <= 0) {
          throw new Error(`Quantité invalide pour ${item.name}`);
        }
        return {
          ...item,
          saleUnit: getSaleQuantityUnit(product, tier),
          retailQuantity,
        };
      });

      const itemsByProduct = new Map<string, SaleItem[]>();
      for (const item of enrichedItems) {
        const list = itemsByProduct.get(item.productId) ?? [];
        list.push(item);
        itemsByProduct.set(item.productId, list);
      }

      const stockUpdates = [...itemsByProduct.entries()].map(([productId, productItems]) => {
        const product = productsById.get(productId)!;
        const previous = stockByProductId.get(productId)!;
        const next = applySaleItemsToDecomposedStock(previous, product, productItems);

        return {
          productId,
          productName: productItems[0]?.name ?? product.name,
          product,
          items: productItems,
          previous,
          next,
          ref: doc(db, STOCKS_COLLECTION, `${store.id}_${productId}`),
        };
      });

      // --- ÉTAPE 3 : TOUTES LES ÉCRITURES (WRITES) ---

      const saleRef = doc(collection(db, COLLECTION_NAME));

      for (const update of stockUpdates) {
        const retailDelta = update.previous.quantity - update.next.quantity;

        transaction.set(
          update.ref,
          {
            ...buildStockLevelPayload(update.productId, store.id, update.next),
            lastUpdated: serverTimestamp(),
          },
          { merge: true }
        );

        const moveRef = doc(collection(db, MOVEMENTS_COLLECTION));
        transaction.set(moveRef, {
          id: moveRef.id,
          productId: update.productId,
          productName: update.productName,
          storeId: store.id,
          storeName: store.name,
          type: "SALE",
          delta: -retailDelta,
          previousStock: update.previous.quantity,
          newStock: update.next.quantity,
          relatedDocId: saleRef.id,
          performedBy: user.uid,
          performedByName: `${user.firstName} ${user.lastName}`,
          timestamp: serverTimestamp(),
        });
      }

      // Mise à jour de la dette client
      if (client && debtAmount > 0) {
        const clientRef = doc(db, CLIENTS_COLLECTION, client.id);
        transaction.update(clientRef, {
          currentDebt: client.currentDebt + debtAmount
        });
      }

      // Enregistrement de la vente
      const amountPaid = payments.reduce((acc, p) => acc + p.amount, 0);
      
      const saleData: Sale = stripUndefined({
        id: saleRef.id,
        storeId: store.id,
        sellerId: user.uid,
        sellerName: `${user.firstName} ${user.lastName}`,
        timestamp: serverTimestamp(),
        items: enrichedItems,
        subtotal,
        discount,
        total,
        payments,
        amountPaid,
        debtAmount,
        status: "COMPLETED",
        ...(replacesSaleId ? { replacesSaleId } : {}),
        ...(client
          ? {
              clientId: client.id,
              clientName: client.name,
              clientPhone: client.phone,
              clientType: client.type,
            }
          : {}),
      }) as Sale;

      transaction.set(saleRef, saleData);

      // Mouvements de caisse
      for (const payment of payments) {
        if (payment.amount > 0) {
          await CashService.recordMovement(transaction, {
            sessionId: session.id,
            storeId: store.id,
            type: "IN",
            source: "SALE",
            amount: payment.amount,
            method: payment.method,
            user,
            relatedDocId: saleRef.id,
            description: `Vente #${saleRef.id.slice(-6).toUpperCase()}`
          });
        }
      }

      return {
        sale: saleData,
        stockChanges: stockUpdates.map((update) => ({
          productId: update.productId,
          productName: update.productName,
          previousStock: update.previous.quantity,
          newStock: update.next.quantity,
        })),
      };
    });

    void AppNotificationHelper.notifyStockChanges({
      storeId: store.id,
      changes: result.stockChanges,
    });

    return result.sale;
  },

  /**
   * Annule une vente : restock RETURN, reverse caisse / dette, status CANCELLED.
   * Nécessite une session de caisse ouverte sur la boutique.
   */
  async cancelSale(params: {
    saleId: string
    store: Store
    user: UserProfile
    reason?: string
  }): Promise<CancelSaleResult> {
    const { saleId, store, user, reason } = params;

    const session = await CashService.getActiveSession(store.id);
    if (!session) {
      throw new Error("Aucune session de caisse ouverte pour cette boutique.");
    }

    const result = await runTransaction(db, async (transaction) => {
      const saleRef = doc(db, COLLECTION_NAME, saleId);
      const saleSnap = await transaction.get(saleRef);
      if (!saleSnap.exists()) throw new Error("Vente introuvable");

      const sale = saleSnap.data() as Sale;
      if (sale.storeId !== store.id) {
        throw new Error("Cette vente n'appartient pas à la boutique active.");
      }
      if (sale.status === "CANCELLED" || sale.status === "REFUNDED") {
        throw new Error("Cette vente est déjà annulée ou remboursée.");
      }

      let client: Client | null = null;
      if (sale.clientId) {
        const clientRef = doc(db, CLIENTS_COLLECTION, sale.clientId);
        const clientSnap = await transaction.get(clientRef);
        if (clientSnap.exists()) {
          client = clientSnap.data() as Client;
        }
      }

      const productIds = [...new Set(sale.items.map((item) => item.productId))];
      const productRefs = productIds.map((productId) => doc(db, "products", productId));
      const stockRefs = productIds.map((productId) =>
        doc(db, STOCKS_COLLECTION, `${store.id}_${productId}`)
      );

      const productSnaps = await Promise.all(productRefs.map((ref) => transaction.get(ref)));
      const stockSnaps = await Promise.all(stockRefs.map((ref) => transaction.get(ref)));

      const productsById = new Map<string, Product>();
      productIds.forEach((productId, index) => {
        const snap = productSnaps[index];
        if (!snap.exists()) {
          throw new Error(`Produit introuvable : ${productId}`);
        }
        productsById.set(productId, snap.data() as Product);
      });

      const itemsByProduct = new Map<string, SaleItem[]>();
      for (const item of sale.items) {
        const list = itemsByProduct.get(item.productId) ?? [];
        list.push(item);
        itemsByProduct.set(item.productId, list);
      }

      const stockUpdates = productIds.map((productId, index) => {
        const product = productsById.get(productId)!;
        const productItems = itemsByProduct.get(productId) ?? [];
        const snap = stockSnaps[index];
        const previous = normalizeStockLevel(
          snap.exists() ? (snap.data() as StockLevel) : null,
          getRetailUnitsPerPack(normalizeProduct(product))
        );
        const next = applySaleReturnItemsToDecomposedStock(previous, product, productItems);

        return {
          productId,
          productName: productItems[0]?.name ?? product.name,
          previous,
          next,
          ref: stockRefs[index],
        };
      });

      const saleRefLabel = saleId.slice(-6).toUpperCase();
      let debtReversed = 0;
      let debtNotReversed = 0;

      if (client && sale.debtAmount > 0) {
        debtReversed = Math.min(sale.debtAmount, Math.max(0, client.currentDebt));
        debtNotReversed = Math.max(0, sale.debtAmount - debtReversed);
        if (debtReversed > 0) {
          transaction.update(doc(db, CLIENTS_COLLECTION, client.id), {
            currentDebt: client.currentDebt - debtReversed,
          });
        }
      } else if (sale.debtAmount > 0) {
        debtNotReversed = sale.debtAmount;
      }

      for (const update of stockUpdates) {
        const retailDelta = update.next.quantity - update.previous.quantity;

        transaction.set(
          update.ref,
          {
            ...buildStockLevelPayload(update.productId, store.id, update.next),
            lastUpdated: serverTimestamp(),
          },
          { merge: true }
        );

        const moveRef = doc(collection(db, MOVEMENTS_COLLECTION));
        transaction.set(moveRef, {
          id: moveRef.id,
          productId: update.productId,
          productName: update.productName,
          storeId: store.id,
          storeName: store.name,
          type: "RETURN",
          delta: retailDelta,
          previousStock: update.previous.quantity,
          newStock: update.next.quantity,
          relatedDocId: saleId,
          performedBy: user.uid,
          performedByName: `${user.firstName} ${user.lastName}`,
          timestamp: serverTimestamp(),
        });
      }

      for (const payment of sale.payments) {
        if (payment.amount > 0) {
          await CashService.recordMovement(transaction, {
            sessionId: session.id,
            storeId: store.id,
            type: "OUT",
            source: "ADJUSTMENT",
            amount: payment.amount,
            method: payment.method,
            user,
            relatedDocId: saleId,
            description: `Annulation vente #${saleRefLabel}`,
          });
        }
      }

      const cancelledSale = stripUndefined({
        ...sale,
        status: "CANCELLED" as const,
        cancelledAt: serverTimestamp(),
        cancelledBy: user.uid,
        cancelledByName: `${user.firstName} ${user.lastName}`,
        ...(reason?.trim() ? { cancelReason: reason.trim() } : {}),
      }) as Sale;

      transaction.update(
        saleRef,
        stripUndefined({
          status: "CANCELLED",
          debtAmount: 0,
          cancelledAt: serverTimestamp(),
          cancelledBy: user.uid,
          cancelledByName: `${user.firstName} ${user.lastName}`,
          ...(reason?.trim() ? { cancelReason: reason.trim() } : {}),
        })
      );

      return {
        sale: cancelledSale,
        debtReversed,
        debtNotReversed,
        stockChanges: stockUpdates.map((update) => ({
          productId: update.productId,
          productName: update.productName,
          previousStock: update.previous.quantity,
          newStock: update.next.quantity,
        })),
      };
    });

    void AppNotificationHelper.notifyStockChanges({
      storeId: store.id,
      changes: result.stockChanges,
    });

    return {
      sale: result.sale,
      debtReversed: result.debtReversed,
      debtNotReversed: result.debtNotReversed,
    };
  },

  /**
   * Corrige une vente : annulation compensatoire puis recreation avec le panier modifié.
   */
  async correctSale(params: ProcessSaleParams & {
    originalSaleId: string
    cancelReason?: string
  }): Promise<{ cancelled: CancelSaleResult; sale: Sale }> {
    const { originalSaleId, cancelReason, ...saleParams } = params;

    if (saleParams.store.id) {
      const original = await this.getSale(originalSaleId);
      if (!original) throw new Error("Vente d'origine introuvable");
      if (original.storeId !== saleParams.store.id) {
        throw new Error("Cette vente n'appartient pas à la boutique active.");
      }
      if (original.status !== "COMPLETED") {
        throw new Error("Seule une vente terminée peut être corrigée.");
      }
    }

    const cancelled = await this.cancelSale({
      saleId: originalSaleId,
      store: saleParams.store,
      user: saleParams.user,
      reason: cancelReason?.trim() || "Correction de vente",
    });

    const sale = await this.processSale({
      ...saleParams,
      replacesSaleId: originalSaleId,
    });

    await updateDoc(doc(db, COLLECTION_NAME, originalSaleId), {
      replacedBySaleId: sale.id,
    });

    return { cancelled, sale };
  },

  async listRecentSales(storeId?: string, pageSize = 20, lastVisible?: DocumentSnapshot) {
    const constraints: QueryConstraint[] = [];
    if (storeId) {
      constraints.push(where("storeId", "==", storeId));
    }
    if (!storeId) {
      constraints.push(orderBy("timestamp", "desc"));
    }
    if (lastVisible) {
      constraints.push(startAfter(lastVisible));
    }
    constraints.push(limit(pageSize));

    const q = query(collection(db, COLLECTION_NAME), ...constraints);
    const snap = await getDocs(q);
    const sales = snap.docs.map(doc => doc.data() as Sale);
    
    if (storeId) {
      sales.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
    }
    
    return {
      sales,
      lastVisible: snap.docs[snap.docs.length - 1]
    };
  }
};
