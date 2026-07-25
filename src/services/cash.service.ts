
import { 
  collection, 
  doc, 
  getDocs, 
  setDoc, 
  query, 
  where, 
  limit, 
  serverTimestamp,
  runTransaction,
  increment,
  type Transaction
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { CashSession, CashMovement, UserProfile } from "@/lib/types";
import { stripUndefined } from "@/lib/firestore-utils";

const SESSIONS_COLLECTION = "cash_sessions";
const MOVEMENTS_COLLECTION = "cash_movements";

export const CashService = {
  /**
   * Vérifie s'il existe une session ouverte pour la boutique
   */
  async getActiveSession(storeId: string): Promise<CashSession | null> {
    const q = query(
      collection(db, SESSIONS_COLLECTION),
      where("storeId", "==", storeId),
      where("status", "==", "OPEN"),
      limit(1)
    );
    const snap = await getDocs(q);
    return snap.empty ? null : (snap.docs[0].data() as CashSession);
  },

  /**
   * Ouvre une nouvelle session de caisse
   */
  async openSession(storeId: string, user: UserProfile, initialBalances: Record<string, number>) {
    const active = await this.getActiveSession(storeId);
    if (active) throw new Error("Une session est déjà ouverte pour cette boutique.");

    const sessionRef = doc(collection(db, SESSIONS_COLLECTION));
    const session: CashSession = {
      id: sessionRef.id,
      storeId,
      status: "OPEN",
      openedAt: serverTimestamp(),
      openedBy: user.uid,
      openedByName: `${user.firstName} ${user.lastName}`,
      initialBalances,
      expectedBalances: { ...initialBalances },
    };

    await setDoc(sessionRef, session);
    return session;
  },

  /**
   * Clôture la session actuelle
   */
  async closeSession(sessionId: string, user: UserProfile, actualBalances: Record<string, number>, notes?: string) {
    return await runTransaction(db, async (transaction) => {
      const sessionRef = doc(db, SESSIONS_COLLECTION, sessionId);
      const snap = await transaction.get(sessionRef);
      if (!snap.exists()) throw new Error("Session introuvable");
      
      const session = snap.data() as CashSession;
      if (session.status === "CLOSED") throw new Error("Session déjà clôturée");

      const variances: Record<string, number> = {};
      Object.keys(session.expectedBalances).forEach(method => {
        variances[method] = (actualBalances[method] || 0) - session.expectedBalances[method];
      });

      transaction.update(sessionRef, {
        status: "CLOSED",
        closedAt: serverTimestamp(),
        closedBy: user.uid,
        actualBalances,
        variances,
        notes: notes || ""
      });
    });
  },

  /**
   * Enregistre un mouvement de caisse (Utilisé par Ventes, Dépenses, etc.)
   * IMPORTANT: Ne doit pas effectuer de query interne si utilisé dans une transaction.
   */
  async recordMovement(transaction: Transaction, params: {
    sessionId: string,
    storeId: string,
    type: "IN" | "OUT",
    source: CashMovement["source"],
    amount: number,
    method: string,
    user: UserProfile,
    relatedDocId?: string,
    description?: string
  }) {
    const { sessionId, storeId, type, source, amount, method, user, relatedDocId, description } = params;

    const sessionRef = doc(db, SESSIONS_COLLECTION, sessionId);
    const moveRef = doc(collection(db, MOVEMENTS_COLLECTION));

    const movement = stripUndefined({
      id: moveRef.id,
      storeId,
      sessionId,
      type,
      source,
      amount,
      method,
      timestamp: serverTimestamp(),
      performedBy: user.uid,
      performedByName: `${user.firstName} ${user.lastName}`,
      relatedDocId,
      description,
    });

    transaction.set(moveRef, movement);

    // Mettre à jour le solde attendu dans la session
    const delta = type === "IN" ? amount : -amount;
    transaction.update(sessionRef, {
      [`expectedBalances.${method}`]: increment(delta)
    });
  },

  async listSessions(storeId: string, count = 20) {
    const q = query(
      collection(db, SESSIONS_COLLECTION),
      where("storeId", "==", storeId),
      limit(count)
    );
    const snap = await getDocs(q);
    const sessions = snap.docs.map(doc => doc.data() as CashSession);
    sessions.sort((a, b) => (b.openedAt?.seconds || 0) - (a.openedAt?.seconds || 0));
    return sessions;
  },

  async getMovements(sessionId: string, storeId: string) {
    const q = query(
      collection(db, MOVEMENTS_COLLECTION),
      where("storeId", "==", storeId),
      where("sessionId", "==", sessionId)
    );
    const snap = await getDocs(q);
    const movements = snap.docs.map((doc) => doc.data() as CashMovement);
    movements.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
    return movements;
  }
};
