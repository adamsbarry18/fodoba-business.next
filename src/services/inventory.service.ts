
import { 
  collection, 
  doc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  limit, 
  runTransaction,
  serverTimestamp,
  startAfter,
  DocumentSnapshot,
  type QueryConstraint
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { StockMovement, StockLevel, Product, Store, UserProfile } from "@/lib/types";
import { AppNotificationHelper } from "@/lib/notifications/app-notification-helper";
import { stripUndefined } from "@/lib/firestore-utils";
import {
  buildDecomposedStock,
  buildStockLevelPayload,
  normalizeStockLevel,
  applyRetailQuantityIn,
  applyRetailQuantityOut,
} from "@/lib/stock-utils";
import { getRetailUnitsPerPack, normalizeProduct } from "@/lib/product-utils";

const MOVEMENTS_COLLECTION = "inventory_movements";
const STOCKS_COLLECTION = "stocks";

type StockMovementWrite = Omit<StockMovement, "timestamp" | "reason" | "relatedDocId"> & {
  timestamp: ReturnType<typeof serverTimestamp>;
  reason?: string;
  relatedDocId?: string;
};

export const InventoryService = {
  async recordMovement(params: {
    productId: string,
    storeId: string,
    type: StockMovement["type"],
    delta: number,
    user: UserProfile,
    reason?: string,
    relatedDocId?: string
  }) {
    const { productId, storeId, type, delta, user, reason, relatedDocId } = params;
    const stockId = `${storeId}_${productId}`;
    const stockRef = doc(db, STOCKS_COLLECTION, stockId);
    const movementRef = doc(collection(db, MOVEMENTS_COLLECTION));
    const productRef = doc(db, "products", productId);
    const storeRef = doc(db, "stores", storeId);

    const movement = await runTransaction(db, async (transaction) => {
      const stockSnap = await transaction.get(stockRef);
      const productSnap = await transaction.get(productRef);
      const storeSnap = await transaction.get(storeRef);

      if (!productSnap.exists()) throw new Error("Produit introuvable");
      if (!storeSnap.exists()) throw new Error("Boutique introuvable");

      const product = productSnap.data() as Product;
      const store = storeSnap.data() as Store;
      const currentQty = stockSnap.exists() ? (stockSnap.data() as StockLevel).quantity : 0;
      const newQty = currentQty + delta;

      if (newQty < 0) {
        throw new Error(`Stock insuffisant pour ${product.name}. Disponible: ${currentQty}`);
      }

      transaction.set(stockRef, {
        productId,
        storeId,
        quantity: newQty,
        lastUpdated: serverTimestamp()
      }, { merge: true });

      const movementData: StockMovementWrite = {
        id: movementRef.id,
        productId,
        productName: product.name,
        storeId,
        storeName: store.name,
        type,
        delta,
        previousStock: currentQty,
        newStock: newQty,
        performedBy: user.uid,
        performedByName: `${user.firstName} ${user.lastName}`,
        timestamp: serverTimestamp()
      };

      if (reason) movementData.reason = reason;
      if (relatedDocId) movementData.relatedDocId = relatedDocId;

      transaction.set(movementRef, movementData);
      return movementData as StockMovement;
    });

    void AppNotificationHelper.notifyStockChanges({
      storeId,
      changes: [
        {
          productId,
          productName: movement.productName,
          previousStock: movement.previousStock,
          newStock: movement.newStock,
        },
      ],
    });

    return movement;
  },

  /** Fixe le stock conditionnement + détail (correction inventaire, création produit) */
  async setStockDecomposed(params: {
    productId: string
    storeId: string
    packagingQty: number
    detailQty: number
    user: UserProfile
    reason?: string
    type?: StockMovement["type"]
    relatedDocId?: string
  }) {
    const {
      productId,
      storeId,
      packagingQty,
      detailQty,
      user,
      reason,
      type = "CORRECTION",
      relatedDocId,
    } = params;

    const stockId = `${storeId}_${productId}`;
    const stockRef = doc(db, STOCKS_COLLECTION, stockId);
    const movementRef = doc(collection(db, MOVEMENTS_COLLECTION));
    const productRef = doc(db, "products", productId);
    const storeRef = doc(db, "stores", storeId);

    const movement = await runTransaction(db, async (transaction) => {
      const [stockSnap, productSnap, storeSnap] = await Promise.all([
        transaction.get(stockRef),
        transaction.get(productRef),
        transaction.get(storeRef),
      ]);

      if (!productSnap.exists()) throw new Error("Produit introuvable");
      if (!storeSnap.exists()) throw new Error("Boutique introuvable");

      const product = productSnap.data() as Product;
      const store = storeSnap.data() as Store;
      const normalized = normalizeProduct(product);
      const ratio = getRetailUnitsPerPack(normalized);
      const previous = normalizeStockLevel(
        stockSnap.exists() ? (stockSnap.data() as StockLevel) : null,
        ratio
      );
      const next = buildDecomposedStock(
        packagingQty,
        detailQty,
        normalized.unitsPerPack,
        normalized.retailQtyFactor
      );
      const delta = next.quantity - previous.quantity;

      transaction.set(
        stockRef,
        {
          ...buildStockLevelPayload(productId, storeId, next),
          lastUpdated: serverTimestamp(),
        },
        { merge: true }
      );

      if (delta !== 0) {
        transaction.set(
          movementRef,
          stripUndefined({
            id: movementRef.id,
            productId,
            productName: product.name,
            storeId,
            storeName: store.name,
            type,
            delta,
            previousStock: previous.quantity,
            newStock: next.quantity,
            reason,
            relatedDocId,
            performedBy: user.uid,
            performedByName: `${user.firstName} ${user.lastName}`,
            timestamp: serverTimestamp(),
          })
        );
      }

      return {
        previous,
        next,
        delta,
        productName: product.name,
      };
    });

    if (movement.delta !== 0) {
      void AppNotificationHelper.notifyStockChanges({
        storeId,
        changes: [
          {
            productId,
            productName: movement.productName,
            previousStock: movement.previous.quantity,
            newStock: movement.next.quantity,
          },
        ],
      });
    }

    return movement.next;
  },

  /** Ajuste conditionnement et/ou détail (±N) sur la fiche produit */
  async adjustDecomposedStock(params: {
    productId: string
    storeId: string
    packagingDelta?: number
    detailDelta?: number
    user: UserProfile
    reason?: string
  }) {
    const {
      productId,
      storeId,
      packagingDelta = 0,
      detailDelta = 0,
      user,
      reason,
    } = params
    if (packagingDelta === 0 && detailDelta === 0) return

    const stockId = `${storeId}_${productId}`
    const stockRef = doc(db, STOCKS_COLLECTION, stockId)
    const movementRef = doc(collection(db, MOVEMENTS_COLLECTION))
    const productRef = doc(db, "products", productId)
    const storeRef = doc(db, "stores", storeId)

    const movement = await runTransaction(db, async (transaction) => {
      const [stockSnap, productSnap, storeSnap] = await Promise.all([
        transaction.get(stockRef),
        transaction.get(productRef),
        transaction.get(storeRef),
      ])

      if (!productSnap.exists()) throw new Error("Produit introuvable")
      if (!storeSnap.exists()) throw new Error("Boutique introuvable")

      const product = productSnap.data() as Product
      const store = storeSnap.data() as Store
      const normalized = normalizeProduct(product)
      const ratio = getRetailUnitsPerPack(normalized)
      const previous = normalizeStockLevel(
        stockSnap.exists() ? (stockSnap.data() as StockLevel) : null,
        ratio
      )

      let next = previous

      if (packagingDelta !== 0) {
        const newPackaging = previous.packagingQty + packagingDelta
        if (newPackaging < 0) {
          const unit = normalized.packagingUnit || normalized.unit
          throw new Error(
            `Stock conditionnement insuffisant. Disponible : ${previous.packagingQty} ${unit}`
          )
        }
        next = buildDecomposedStock(
          newPackaging,
          next.detailQty,
          normalized.unitsPerPack,
          normalized.retailQtyFactor
        )
      }

      if (detailDelta !== 0) {
        next =
          detailDelta > 0
            ? applyRetailQuantityIn(next, detailDelta, ratio)
            : applyRetailQuantityOut(next, -detailDelta, ratio)
      }

      transaction.set(
        stockRef,
        {
          ...buildStockLevelPayload(productId, storeId, next),
          lastUpdated: serverTimestamp(),
        },
        { merge: true }
      )

      const qtyDelta = next.quantity - previous.quantity
      if (qtyDelta !== 0) {
        transaction.set(
          movementRef,
          stripUndefined({
            id: movementRef.id,
            productId,
            productName: product.name,
            storeId,
            storeName: store.name,
            type: "CORRECTION",
            delta: qtyDelta,
            previousStock: previous.quantity,
            newStock: next.quantity,
            reason,
            performedBy: user.uid,
            performedByName: `${user.firstName} ${user.lastName}`,
            timestamp: serverTimestamp(),
          })
        )
      }

      return { previous, next, productName: product.name, qtyDelta }
    })

    if (movement.qtyDelta !== 0) {
      void AppNotificationHelper.notifyStockChanges({
        storeId,
        changes: [
          {
            productId,
            productName: movement.productName,
            previousStock: movement.previous.quantity,
            newStock: movement.next.quantity,
          },
        ],
      })
    }

    return movement.next
  },

  /** Ajuste le stock détail de ±N unités (boutons +1/−1 sur la fiche produit) */
  async adjustDetailStock(params: {
    productId: string
    storeId: string
    delta: number
    user: UserProfile
    reason?: string
  }) {
    return this.adjustDecomposedStock({
      productId: params.productId,
      storeId: params.storeId,
      detailDelta: params.delta,
      user: params.user,
      reason: params.reason,
    })
  },

  async transferStock(params: {
    productId: string,
    fromStoreId: string,
    toStoreId: string,
    quantity: number,
    user: UserProfile,
    reason?: string
  }) {
    const { productId, fromStoreId, toStoreId, quantity, user, reason } = params;
    if (quantity <= 0) throw new Error("La quantité doit être supérieure à 0");
    if (fromStoreId === toStoreId) throw new Error("Les boutiques source et destination doivent être différentes");

    const fromStockId = `${fromStoreId}_${productId}`;
    const toStockId = `${toStoreId}_${productId}`;
    const fromStockRef = doc(db, STOCKS_COLLECTION, fromStockId);
    const toStockRef = doc(db, STOCKS_COLLECTION, toStockId);
    const productRef = doc(db, "products", productId);
    const fromStoreRef = doc(db, "stores", fromStoreId);
    const toStoreRef = doc(db, "stores", toStoreId);

    return await runTransaction(db, async (transaction) => {
      const fromStockSnap = await transaction.get(fromStockRef);
      const toStockSnap = await transaction.get(toStockRef);
      const productSnap = await transaction.get(productRef);
      const fromStoreSnap = await transaction.get(fromStoreRef);
      const toStoreSnap = await transaction.get(toStoreRef);

      if (!productSnap.exists()) throw new Error("Produit introuvable");
      if (!fromStoreSnap.exists() || !toStoreSnap.exists()) throw new Error("Boutique introuvable");

      const product = productSnap.data() as Product;
      const fromStore = fromStoreSnap.data() as Store;
      const toStore = toStoreSnap.data() as Store;
      const normalized = normalizeProduct(product);

      const ratio = getRetailUnitsPerPack(normalized);
      const previousFrom = normalizeStockLevel(
        fromStockSnap.exists() ? (fromStockSnap.data() as StockLevel) : null,
        ratio
      );
      const previousTo = normalizeStockLevel(
        toStockSnap.exists() ? (toStockSnap.data() as StockLevel) : null,
        ratio
      );

      const nextFrom = applyRetailQuantityOut(previousFrom, quantity, ratio);
      const nextTo = applyRetailQuantityIn(previousTo, quantity, ratio);

      transaction.set(
        fromStockRef,
        {
          ...buildStockLevelPayload(productId, fromStoreId, nextFrom),
          lastUpdated: serverTimestamp(),
        },
        { merge: true }
      );

      transaction.set(
        toStockRef,
        {
          ...buildStockLevelPayload(productId, toStoreId, nextTo),
          lastUpdated: serverTimestamp(),
        },
        { merge: true }
      );

      const moveOutRef = doc(collection(db, MOVEMENTS_COLLECTION));
      const moveOutData: StockMovementWrite = {
        id: moveOutRef.id,
        productId,
        productName: product.name,
        storeId: fromStoreId,
        storeName: fromStore.name,
        type: "TRANSFER_OUT",
        delta: nextFrom.quantity - previousFrom.quantity,
        previousStock: previousFrom.quantity,
        newStock: nextFrom.quantity,
        reason: reason || `Transfert vers ${toStore.name}`,
        performedBy: user.uid,
        performedByName: `${user.firstName} ${user.lastName}`,
        timestamp: serverTimestamp()
      };
      transaction.set(moveOutRef, moveOutData);

      const moveInRef = doc(collection(db, MOVEMENTS_COLLECTION));
      const moveInData: StockMovementWrite = {
        id: moveInRef.id,
        productId,
        productName: product.name,
        storeId: toStoreId,
        storeName: toStore.name,
        type: "TRANSFER_IN",
        delta: nextTo.quantity - previousTo.quantity,
        previousStock: previousTo.quantity,
        newStock: nextTo.quantity,
        reason: reason || `Transfert depuis ${fromStore.name}`,
        performedBy: user.uid,
        performedByName: `${user.firstName} ${user.lastName}`,
        timestamp: serverTimestamp()
      };
      transaction.set(moveInRef, moveInData);
    });
  },

  async listMovements(filters: { storeId?: string, productId?: string }, pageSize = 20, lastVisible?: DocumentSnapshot) {
    const constraints: QueryConstraint[] = [];

    if (filters.storeId) {
      constraints.push(where("storeId", "==", filters.storeId));
    }
    if (filters.productId) {
      constraints.push(where("productId", "==", filters.productId));
    }

    if (constraints.length === 0) {
      constraints.push(orderBy("timestamp", "desc"));
    }

    if (lastVisible) {
      constraints.push(startAfter(lastVisible));
    }

    constraints.push(limit(pageSize));

    const q = query(collection(db, MOVEMENTS_COLLECTION), ...constraints);
    const snap = await getDocs(q);
    
    const movements = snap.docs.map(doc => doc.data() as StockMovement);
    
    if (constraints.length > 0 && !constraints.some(c => c.type === 'orderBy')) {
      movements.sort((a, b) => {
        const timeA = a.timestamp?.seconds || 0;
        const timeB = b.timestamp?.seconds || 0;
        return timeB - timeA;
      });
    }

    return {
      movements,
      lastVisible: snap.docs[snap.docs.length - 1]
    };
  }
};
