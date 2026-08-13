import type { Expense } from "@/lib/types"
import { startOfMonth, endOfMonth, isWithinInterval } from "date-fns"
import { matchesAnySearchField, prepareSearchQuery } from "@/lib/search-utils"

export const EXPENSE_CATEGORIES = [
  "rent",
  "electricity",
  "water",
  "transport",
  "staff",
  "supplies",
  "maintenance",
  "marketing",
  "misc",
] as const

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]

const EXPENSE_CATEGORY_LABEL_KEYS: Record<ExpenseCategory, string> = {
  rent: "expenses.categories.rent",
  electricity: "expenses.categories.electricity",
  water: "expenses.categories.water",
  transport: "expenses.categories.transport",
  staff: "expenses.categories.staff",
  supplies: "expenses.categories.supplies",
  maintenance: "expenses.categories.maintenance",
  marketing: "expenses.categories.marketing",
  misc: "expenses.categories.misc",
}

/** Anciennes valeurs FR → id canonique anglais. */
const EXPENSE_CATEGORY_ALIASES: Record<string, ExpenseCategory> = {
  rent: "rent",
  Loyer: "rent",
  electricity: "electricity",
  Électricité: "electricity",
  Electricite: "electricity",
  water: "water",
  Eau: "water",
  transport: "transport",
  Transport: "transport",
  staff: "staff",
  Personnel: "staff",
  supplies: "supplies",
  Fournitures: "supplies",
  maintenance: "maintenance",
  Maintenance: "maintenance",
  marketing: "marketing",
  Marketing: "marketing",
  misc: "misc",
  Divers: "misc",
}

for (const [from, to] of Object.entries({ ...EXPENSE_CATEGORY_ALIASES })) {
  EXPENSE_CATEGORY_ALIASES[from.toLowerCase()] = to
}

export function canonicalizeExpenseCategory(category: string): string {
  const trimmed = category.trim()
  if (!trimmed) return trimmed
  return EXPENSE_CATEGORY_ALIASES[trimmed] ?? EXPENSE_CATEGORY_ALIASES[trimmed.toLowerCase()] ?? trimmed
}

/** Libellé i18n si catégorie connue (y compris anciennes valeurs FR), sinon valeur brute. */
export function getExpenseCategoryLabel(
  category: string,
  t: (key: string) => string
): string {
  const canonical = canonicalizeExpenseCategory(category)
  const key = EXPENSE_CATEGORY_LABEL_KEYS[canonical as ExpenseCategory]
  return key ? t(key) : category
}
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
      !opts.category ||
      opts.category === "all" ||
      canonicalizeExpenseCategory(e.category) === canonicalizeExpenseCategory(opts.category)
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
    const id = canonicalizeExpenseCategory(e.category)
    totals[id] = (totals[id] || 0) + e.amount
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
