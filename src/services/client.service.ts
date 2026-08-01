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
  runTransaction
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { Client, ClientPayment, Sale, UserProfile } from "@/lib/types";
import { stripUndefined } from "@/lib/firestore-utils";
import { getSaleOpenDebt, isSaleCountedInRevenue, sumOpenSaleDebt } from "@/lib/sale-utils";
import { CashService } from "./cash.service";
import type { ClientDeleteBlocker } from "@/lib/client-utils";

const COLLECTION_NAME = "clients";
const PAYMENTS_COLLECTION = "client_payments";
const SALES_COLLECTION = "sales";

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

async function fetchByClientAndStores<T extends { timestamp?: unknown }>(
  collectionName: string,
  clientId: string,
  storeIds: string[]
): Promise<T[]> {
  if (!storeIds.length) return [];

  const uniqueStoreIds = [...new Set(storeIds)];
  const results = await Promise.all(
    uniqueStoreIds.map(async (storeId) => {
      const q = query(
        collection(db, collectionName),
        where("clientId", "==", clientId),
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

async function countClientDocuments(
  collectionName: string,
  clientId: string
): Promise<number> {
  const q = query(
    collection(db, collectionName),
    where("clientId", "==", clientId)
  );
  const snap = await getDocs(q);
  return snap.size;
}

export const ClientService = {
  async createClient(data: Omit<Client, "id" | "createdAt" | "currentDebt">) {
    const newDocRef = doc(collection(db, COLLECTION_NAME));
    const client: Client = {
      ...data,
      id: newDocRef.id,
      currentDebt: 0,
      createdAt: serverTimestamp(),
    };
    await setDoc(newDocRef, stripUndefined(client));
    return client;
  },

  async updateClient(
    id: string,
    data: Partial<
      Pick<Client, "name" | "phone" | "address" | "type" | "status" | "creditCeiling">
    >
  ) {
    const docRef = doc(db, COLLECTION_NAME, id);
    await updateDoc(docRef, stripUndefined(data));
  },

  async getClient(id: string) {
    const docRef = doc(db, COLLECTION_NAME, id);
    const snap = await getDoc(docRef);
    return snap.exists() ? (snap.data() as Client) : null;
  },

  async listClients() {
    const q = query(collection(db, COLLECTION_NAME), orderBy("name", "asc"));
    const snap = await getDocs(q);
    return snap.docs.map(doc => doc.data() as Client);
  },

  async getDeleteBlockers(clientId: string): Promise<ClientDeleteBlocker[]> {
    const client = await this.getClient(clientId);
    if (!client) throw new Error("CLIENT_NOT_FOUND");

    const blockers: ClientDeleteBlocker[] = [];
    if (client.currentDebt > 0) blockers.push("debt");

    const [salesCount, paymentCount] = await Promise.all([
      countClientDocuments(SALES_COLLECTION, clientId),
      countClientDocuments(PAYMENTS_COLLECTION, clientId),
    ]);

    if (salesCount > 0) blockers.push("sales");
    if (paymentCount > 0) blockers.push("payments");

    return blockers;
  },

  async deleteClient(id: string) {
    const blockers = await this.getDeleteBlockers(id);
    if (blockers.length > 0) {
      throw new Error(`CLIENT_DELETE_BLOCKED:${blockers.join(",")}`);
    }

    const docRef = doc(db, COLLECTION_NAME, id);
    await deleteDoc(docRef);
  },

  async getClientPayments(clientId: string, storeIds: string[]) {
    return fetchByClientAndStores<ClientPayment>(
      PAYMENTS_COLLECTION,
      clientId,
      storeIds
    );
  },

  async getClientSales(clientId: string, storeIds: string[]) {
    return fetchByClientAndStores<Sale>(
      SALES_COLLECTION,
      clientId,
      storeIds
    );
  },

  /** Factures terminées encore à crédit, plus anciennes d'abord (FIFO). */
  async listOpenDebtSales(clientId: string, storeIds: string[]): Promise<Sale[]> {
    const sales = await this.getClientSales(clientId, storeIds);
    return sales
      .filter((sale) => getSaleOpenDebt(sale) > 0)
      .sort(
        (a, b) => getTimestampSortValue(a.timestamp) - getTimestampSortValue(b.timestamp)
      );
  },

  /**
   * Recalcule `currentDebt` = somme des restes dus des factures actives.
   * Corrige les dérives (remboursements globaux non ventilés, etc.).
   */
  async syncCurrentDebtFromSales(clientId: string, storeIds: string[]): Promise<number> {
    const sales = await this.getClientSales(clientId, storeIds);
    const outstanding = sumOpenSaleDebt(sales);
    await updateDoc(doc(db, COLLECTION_NAME, clientId), {
      currentDebt: outstanding,
    });
    return outstanding;
  },

  /**
   * Enregistre un remboursement.
   * - Avec `saleId` : ventile sur cette facture.
   * - Sans `saleId` : ventile en FIFO sur les factures ouvertes (plus anciennes d'abord).
   * `currentDebt` est ensuite aligné sur la somme des restes dus (scope `allocateStoreIds`).
   */
  async recordPayment(params: {
    clientId: string
    amount: number
    method: ClientPayment["method"]
    storeId: string
    user: UserProfile
    notes?: string
    saleId?: string
    allocateStoreIds?: string[]
  }) {
    const {
      clientId,
      amount,
      method,
      storeId,
      user,
      notes,
      saleId,
      allocateStoreIds,
    } = params;

    if (!amount || amount <= 0) {
      throw new Error("Montant invalide");
    }

    const session = await CashService.getActiveSession(storeId);
    if (!session) {
      throw new Error("Veuillez ouvrir la caisse pour enregistrer un remboursement.");
    }

    const scopeStoreIds = [...new Set(allocateStoreIds?.length ? allocateStoreIds : [storeId])];

    // Toutes les factures ouvertes du scope (pour sync final + FIFO)
    let openSales = await this.listOpenDebtSales(clientId, scopeStoreIds);

    if (saleId) {
      const inScope = openSales.find((s) => s.id === saleId);
      if (!inScope) {
        const snap = await getDoc(doc(db, SALES_COLLECTION, saleId));
        if (!snap.exists()) throw new Error("Facture introuvable");
        const sale = snap.data() as Sale;
        if (sale.clientId !== clientId) {
          throw new Error("Cette facture n'appartient pas à ce client.");
        }
        if (!isSaleCountedInRevenue(sale) || getSaleOpenDebt(sale) <= 0) {
          throw new Error("Cette facture est déjà soldée.");
        }
        if (sale.storeId !== storeId) {
          throw new Error("Activez la boutique de la facture pour enregistrer le remboursement.");
        }
        openSales = [sale, ...openSales.filter((s) => s.id !== sale.id)];
      } else if (inScope.storeId !== storeId) {
        throw new Error("Activez la boutique de la facture pour enregistrer le remboursement.");
      }
    }

    const invoiceDebtTotal = sumOpenSaleDebt(openSales);
    if (invoiceDebtTotal <= 0) {
      throw new Error("Ce client n'a aucune dette à rembourser.");
    }

    const targetOpen = saleId
      ? getSaleOpenDebt(openSales.find((s) => s.id === saleId)!)
      : invoiceDebtTotal;
    const maxPayable = Math.min(amount, targetOpen);
    if (maxPayable <= 0) {
      throw new Error("Montant invalide pour ce remboursement.");
    }

    const saleIdsToRead = [...new Set(openSales.map((s) => s.id))];

    return await runTransaction(db, async (transaction) => {
      const clientRef = doc(db, COLLECTION_NAME, clientId);
      const clientSnap = await transaction.get(clientRef);
      if (!clientSnap.exists()) throw new Error("Client introuvable");
      const client = clientSnap.data() as Client;

      const saleRefs = saleIdsToRead.map((id) => doc(db, SALES_COLLECTION, id));
      const saleSnaps = await Promise.all(saleRefs.map((ref) => transaction.get(ref)));

      const liveById = new Map<string, Sale>();
      saleSnaps.forEach((snap, index) => {
        if (!snap.exists()) return;
        const sale = snap.data() as Sale;
        if (sale.clientId !== clientId) return;
        if (!isSaleCountedInRevenue(sale)) return;
        liveById.set(saleIdsToRead[index]!, sale);
      });

      const liveOpen = saleIdsToRead
        .map((id) => liveById.get(id))
        .filter((s): s is Sale => !!s && getSaleOpenDebt(s) > 0)
        .sort(
          (a, b) => getTimestampSortValue(a.timestamp) - getTimestampSortValue(b.timestamp)
        );

      if (liveOpen.length === 0) {
        throw new Error("Ce client n'a aucune dette à rembourser.");
      }

      if (saleId) {
        const target = liveOpen.find((s) => s.id === saleId);
        if (!target) throw new Error("Cette facture est déjà soldée.");
      }

      let remainingPay = maxPayable;
      const allocations: { saleId: string; sale: Sale; applied: number }[] = [];

      for (const sale of liveOpen) {
        if (remainingPay <= 0) break;
        if (saleId && sale.id !== saleId) continue;
        const applied = Math.min(remainingPay, getSaleOpenDebt(sale));
        if (applied <= 0) continue;
        allocations.push({ saleId: sale.id, sale, applied });
        remainingPay -= applied;
      }

      const paidTotal = allocations.reduce((acc, a) => acc + a.applied, 0);
      if (paidTotal <= 0) {
        throw new Error("Montant invalide pour ce remboursement.");
      }

      const remainingById = new Map<string, number>();
      for (const sale of liveOpen) {
        remainingById.set(sale.id, getSaleOpenDebt(sale));
      }
      for (const { saleId: id, applied } of allocations) {
        remainingById.set(id, Math.max(0, (remainingById.get(id) || 0) - applied));
      }

      for (const { saleId: id, sale, applied } of allocations) {
        const nextDebtAmount = remainingById.get(id) ?? 0;
        transaction.update(doc(db, SALES_COLLECTION, id), {
          debtAmount: nextDebtAmount,
          amountPaid: (sale.amountPaid || 0) + applied,
          payments: [...(sale.payments || []), { method, amount: applied }],
        });
      }

      const outstanding = [...remainingById.values()].reduce((acc, v) => acc + v, 0);
      transaction.update(clientRef, { currentDebt: outstanding });

      const paymentRef = doc(collection(db, PAYMENTS_COLLECTION));
      const payment = stripUndefined({
        id: paymentRef.id,
        clientId,
        amount: paidTotal,
        method,
        timestamp: serverTimestamp(),
        storeId,
        performedBy: user.uid,
        notes: notes || "",
        ...(saleId ? { saleId } : {}),
      }) as ClientPayment;

      transaction.set(paymentRef, payment);

      const saleRefLabel = saleId ? saleId.slice(-6).toUpperCase() : null;
      await CashService.recordMovement(transaction, {
        sessionId: session.id,
        storeId,
        type: "IN",
        source: "CLIENT_PAYMENT",
        amount: paidTotal,
        method,
        user,
        relatedDocId: paymentRef.id,
        description: saleRefLabel
          ? `Remboursement facture #${saleRefLabel}: ${client.name}`
          : `Remboursement: ${client.name}`,
      });

      return payment;
    });
  },
};
