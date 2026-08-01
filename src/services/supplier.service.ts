
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
  deleteDoc,
  where,
  runTransaction,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { Supplier, SupplierPayment, Purchase, UserProfile } from "@/lib/types";
import { stripUndefined } from "@/lib/firestore-utils";
import { CashService } from "./cash.service";
import {
  computeSupplierOutstandingDebt,
  type SupplierDeleteBlocker,
} from "@/lib/supplier-utils";

const COLLECTION_NAME = "suppliers";
const PAYMENTS_COLLECTION = "supplier_payments";
const PURCHASES_COLLECTION = "purchases";

function getTimestampSortValue(timestamp: unknown): number {
  if (!timestamp || typeof timestamp !== "object") return 0;
  if ("seconds" in timestamp && typeof (timestamp as { seconds: number }).seconds === "number") {
    return (timestamp as { seconds: number }).seconds;
  }
  if ("toDate" in timestamp && typeof (timestamp as { toDate: () => Date }).toDate === "function") {
    return (timestamp as { toDate: () => Date }).toDate().getTime();
  }
  return 0;
}

async function fetchBySupplierAndStores<T extends { timestamp?: unknown }>(
  collectionName: string,
  supplierId: string,
  storeIds: string[],
  fieldName: "supplierId" = "supplierId"
): Promise<T[]> {
  if (!storeIds.length) return [];

  const uniqueStoreIds = [...new Set(storeIds)];
  const results = await Promise.all(
    uniqueStoreIds.map(async (storeId) => {
      const q = query(
        collection(db, collectionName),
        where(fieldName, "==", supplierId),
        where("storeId", "==", storeId)
      );
      const snap = await getDocs(q);
      return snap.docs.map((docSnap) => docSnap.data() as T);
    })
  );

  return results
    .flat()
    .sort((a, b) => getTimestampSortValue(b.timestamp) - getTimestampSortValue(a.timestamp));
}

async function countSupplierDocuments(
  collectionName: string,
  supplierId: string
): Promise<number> {
  const q = query(
    collection(db, collectionName),
    where("supplierId", "==", supplierId)
  );
  const snap = await getDocs(q);
  return snap.size;
}

export const SupplierService = {
  async createSupplier(data: Omit<Supplier, "id" | "createdAt" | "currentDebt">) {
    const newDocRef = doc(collection(db, COLLECTION_NAME));
    const supplier: Supplier = {
      ...data,
      id: newDocRef.id,
      currentDebt: 0,
      createdAt: serverTimestamp(),
    };
    await setDoc(newDocRef, stripUndefined(supplier));
    return supplier;
  },

  async updateSupplier(
    id: string,
    data: Partial<
      Pick<
        Supplier,
        "name" | "country" | "city" | "type" | "defaultCurrency" | "paymentTerms"
      >
    >
  ) {
    const docRef = doc(db, COLLECTION_NAME, id);
    await updateDoc(docRef, stripUndefined(data));
  },

  async getSupplier(id: string) {
    const docRef = doc(db, COLLECTION_NAME, id);
    const snap = await getDoc(docRef);
    return snap.exists() ? (snap.data() as Supplier) : null;
  },

  async listSuppliers() {
    const q = query(collection(db, COLLECTION_NAME), orderBy("name", "asc"));
    const snap = await getDocs(q);
    return snap.docs.map((docSnap) => docSnap.data() as Supplier);
  },

  async getDeleteBlockers(supplierId: string): Promise<SupplierDeleteBlocker[]> {
    const supplier = await this.getSupplier(supplierId);
    if (!supplier) throw new Error("SUPPLIER_NOT_FOUND");

    const blockers: SupplierDeleteBlocker[] = [];
    if (supplier.currentDebt > 0) blockers.push("debt");

    const [purchaseCount, paymentCount] = await Promise.all([
      countSupplierDocuments(PURCHASES_COLLECTION, supplierId),
      countSupplierDocuments(PAYMENTS_COLLECTION, supplierId),
    ]);

    if (purchaseCount > 0) blockers.push("purchases");
    if (paymentCount > 0) blockers.push("payments");

    return blockers;
  },

  async deleteSupplier(id: string) {
    const blockers = await this.getDeleteBlockers(id);
    if (blockers.length > 0) {
      throw new Error(`SUPPLIER_DELETE_BLOCKED:${blockers.join(",")}`);
    }

    const docRef = doc(db, COLLECTION_NAME, id);
    await deleteDoc(docRef);
  },

  async recordPayment(params: {
    supplierId: string;
    amount: number;
    method: SupplierPayment["method"];
    storeId: string;
    user: UserProfile;
    notes?: string;
    /** Boutiques pour recalculer l'encours après règlement */
    allocateStoreIds?: string[];
  }) {
    const { supplierId, amount, method, storeId, user, notes, allocateStoreIds } = params;

    if (!amount || amount <= 0) {
      throw new Error("Montant invalide");
    }

    const session = await CashService.getActiveSession(storeId);
    if (!session) {
      throw new Error("Veuillez ouvrir la caisse pour enregistrer un règlement.");
    }

    const scopeStoreIds = [...new Set(allocateStoreIds?.length ? allocateStoreIds : [storeId])];
    const [purchases, payments] = await Promise.all([
      this.getSupplierPurchases(supplierId, scopeStoreIds),
      this.getSupplierPayments(supplierId, scopeStoreIds),
    ]);
    const outstanding = computeSupplierOutstandingDebt(purchases, payments);
    if (outstanding <= 0) {
      throw new Error("Ce fournisseur n'a aucune dette à régler.");
    }

    const paidAmount = Math.min(amount, outstanding);

    return await runTransaction(db, async (transaction) => {
      const supplierRef = doc(db, COLLECTION_NAME, supplierId);
      const supplierSnap = await transaction.get(supplierRef);

      if (!supplierSnap.exists()) throw new Error("Fournisseur introuvable");

      const supplier = supplierSnap.data() as Supplier;
      const apply = Math.min(paidAmount, outstanding);
      if (apply <= 0) {
        throw new Error("Montant invalide pour ce règlement.");
      }

      transaction.update(supplierRef, {
        currentDebt: Math.max(0, outstanding - apply),
      });

      const paymentRef = doc(collection(db, PAYMENTS_COLLECTION));
      const payment: SupplierPayment = {
        id: paymentRef.id,
        supplierId,
        amount: apply,
        method,
        timestamp: serverTimestamp(),
        storeId,
        performedBy: user.uid,
        notes: notes || "",
      };

      transaction.set(paymentRef, payment);

      await CashService.recordMovement(transaction, {
        sessionId: session.id,
        storeId,
        type: "OUT",
        source: "PURCHASE_PAYMENT",
        amount: apply,
        method,
        user,
        relatedDocId: paymentRef.id,
        description: `Règlement: ${supplier.name}`,
      });

      return payment;
    });
  },

  /**
   * Recalcule `currentDebt` = achats reçus − règlements.
   */
  async syncCurrentDebtFromLedger(supplierId: string, storeIds: string[]): Promise<number> {
    const [purchases, payments] = await Promise.all([
      this.getSupplierPurchases(supplierId, storeIds),
      this.getSupplierPayments(supplierId, storeIds),
    ]);
    const outstanding = computeSupplierOutstandingDebt(purchases, payments);
    await updateDoc(doc(db, COLLECTION_NAME, supplierId), {
      currentDebt: outstanding,
    });
    return outstanding;
  },

  async getSupplierPayments(supplierId: string, storeIds: string[]) {
    return fetchBySupplierAndStores<SupplierPayment>(
      PAYMENTS_COLLECTION,
      supplierId,
      storeIds
    );
  },

  async getSupplierPurchases(supplierId: string, storeIds: string[]) {
    return fetchBySupplierAndStores<Purchase>(
      PURCHASES_COLLECTION,
      supplierId,
      storeIds
    );
  },
};
