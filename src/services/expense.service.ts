
import { 
  collection, 
  doc, 
  getDocs,  
  query, 
  where, 
  limit, 
  serverTimestamp,
  runTransaction
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { Expense, UserProfile } from "@/lib/types";
import { CashService } from "./cash.service";
import { canonicalizeExpenseCategory } from "@/lib/expense-utils";

const COLLECTION_NAME = "expenses";

export const ExpenseService = {
  async createExpense(params: {
    storeId: string,
    category: string,
    label: string,
    amount: number,
    method: string,
    user: UserProfile,
    notes?: string,
    receiptUrl?: string
  }) {
    const { storeId, category, label, amount, method, user, notes, receiptUrl } = params;

    const session = await CashService.getActiveSession(storeId);
    if (!session) throw new Error("Veuillez ouvrir la caisse avant d'enregistrer une dépense.");

    return await runTransaction(db, async (transaction) => {
      const expenseRef = doc(collection(db, COLLECTION_NAME));
      const expense: Expense = {
        id: expenseRef.id,
        storeId,
        category: canonicalizeExpenseCategory(category),
        label,
        amount,
        method,
        timestamp: serverTimestamp(),
        performedBy: user.uid,
        performedByName: `${user.firstName} ${user.lastName}`,
        notes: notes || "",
        receiptUrl: receiptUrl || ""
      };

      transaction.set(expenseRef, expense);

      await CashService.recordMovement(transaction, {
        sessionId: session.id,
        storeId,
        type: "OUT",
        source: "EXPENSE",
        amount,
        method,
        user,
        relatedDocId: expenseRef.id,
        description: `${category}: ${label}`
      });

      return expense;
    });
  },

  async listExpenses(storeId: string, count = 100) {
    const q = query(
      collection(db, COLLECTION_NAME),
      where("storeId", "==", storeId),
      limit(count)
    );
    const snap = await getDocs(q);
    const expenses = snap.docs.map(doc => ({
      ...doc.data(),
      id: doc.id,
    } as Expense));

    expenses.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
    return expenses;
  }
};
