
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

  async recordPayment(params: {
    clientId: string
    amount: number
    method: ClientPayment["method"]
    storeId: string
    user: UserProfile
    notes?: string
    saleId?: string
  }) {
    const { clientId, amount, method, storeId, user, notes, saleId } = params;

    if (!amount || amount <= 0) {
      throw new Error("Montant invalide");
    }

    const session = await CashService.getActiveSession(storeId);
    if (!session) throw new Error("Veuillez ouvrir la caisse pour enregistrer un remboursement.");

    return await runTransaction(db, async (transaction) => {
      const clientRef = doc(db, COLLECTION_NAME, clientId);
      const clientSnap = await transaction.get(clientRef);

      if (!clientSnap.exists()) throw new Error("Client introuvable");

      const client = clientSnap.data() as Client;
      if (client.currentDebt <= 0) {
        throw new Error("Ce client n'a aucune dette à rembourser.");
      }

      let saleRef = saleId ? doc(db, SALES_COLLECTION, saleId) : null;
      let sale: Sale | null = null;

      if (saleRef) {
        const saleSnap = await transaction.get(saleRef);
        if (!saleSnap.exists()) throw new Error("Facture introuvable");
        sale = saleSnap.data() as Sale;

        if (sale.clientId !== clientId) {
          throw new Error("Cette facture n'appartient pas à ce client.");
        }
        if (sale.storeId !== storeId) {
          throw new Error("Activez la boutique de la facture pour enregistrer le remboursement.");
        }
        if (sale.status !== "COMPLETED") {
          throw new Error("Seule une facture terminée peut être remboursée.");
        }
        if (sale.debtAmount <= 0) {
          throw new Error("Cette facture est déjà soldée.");
        }
      }

      const maxPayable = sale
        ? Math.min(amount, sale.debtAmount, client.currentDebt)
        : Math.min(amount, client.currentDebt);

      if (maxPayable <= 0) {
        throw new Error("Montant invalide pour ce remboursement.");
      }

      const newDebt = Math.max(0, client.currentDebt - maxPayable);
      transaction.update(clientRef, { currentDebt: newDebt });

      if (sale && saleRef) {
        const nextDebtAmount = Math.max(0, sale.debtAmount - maxPayable);
        const nextAmountPaid = (sale.amountPaid || 0) + maxPayable;
        const nextPayments = [
          ...(sale.payments || []),
          { method, amount: maxPayable },
        ];
        transaction.update(saleRef, {
          debtAmount: nextDebtAmount,
          amountPaid: nextAmountPaid,
          payments: nextPayments,
        });
      }

      const paymentRef = doc(collection(db, PAYMENTS_COLLECTION));
      const payment = stripUndefined({
        id: paymentRef.id,
        clientId,
        amount: maxPayable,
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
        amount: maxPayable,
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
  }
};
