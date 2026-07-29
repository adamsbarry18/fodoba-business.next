import type { Expense } from "@/lib/types"
import { startOfMonth, endOfMonth, isWithinInterval } from "date-fns"
import { matchesAnySearchField, prepareSearchQuery } from "@/lib/search-utils"

export const EXPENSE_CATEGORIES = [
  "Loyer",
  "Électricité",
  "Eau",
  "Transport",
  "Personnel",
  "Fournitures",
  "Maintenance",
  "Marketing",
  "Divers",
] as const

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]
export type ExpenseCategoryFilter = "all" | ExpenseCategory
export type ExpenseMethodFilter = "all" | string

export function toExpenseDate(ts: Expense["timestamp"]): Date | null {
  if (!ts) return null
  return ts.toDate ? ts.toDate() : new Date(ts)
}

export function filterExpenses(
  expenses: Expense[],
  opts: {
    search?: string
    category?: ExpenseCategoryFilter
    method?: ExpenseMethodFilter
  }
): Expense[] {
  const term = prepareSearchQuery(opts.search)
  return expenses.filter((e) => {
    const matchesSearch =
      !term ||
      matchesAnySearchField(
        [e.label, e.category, e.notes, e.performedByName],
        term
      )

    const matchesCategory =
      !opts.category || opts.category === "all" || e.category === opts.category
    const matchesMethod =
      !opts.method || opts.method === "all" || e.method === opts.method

    return matchesSearch && matchesCategory && matchesMethod
  })
}

export function getExpensesThisMonth(expenses: Expense[]): Expense[] {
  const now = new Date()
  const start = startOfMonth(now)
  const end = endOfMonth(now)
  return expenses.filter((e) => {
    const date = toExpenseDate(e.timestamp)
    return date ? isWithinInterval(date, { start, end }) : false
  })
}

export function sumExpenseAmount(expenses: Expense[]): number {
  return expenses.reduce((acc, e) => acc + e.amount, 0)
}

export function getTopExpenseCategory(
  expenses: Expense[]
): { category: string; amount: number } | null {
  const totals: Record<string, number> = {}
  for (const e of expenses) {
    totals[e.category] = (totals[e.category] || 0) + e.amount
  }
  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1])
  if (sorted.length === 0) return null
  return { category: sorted[0]![0], amount: sorted[0]![1] }
}

export function getExpenseStats(expenses: Expense[]) {
  const thisMonth = getExpensesThisMonth(expenses)
  const topCat = getTopExpenseCategory(expenses)
  return {
    totalThisMonth: sumExpenseAmount(thisMonth),
    monthCount: thisMonth.length,
    topCategory: topCat?.category ?? "-",
    topCategoryAmount: topCat?.amount ?? 0,
    count: expenses.length,
    totalAll: sumExpenseAmount(expenses),
  }
}
