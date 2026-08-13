import { CashSession, CashMovement } from "@/lib/types"
import { PAYMENT_METHOD_IDS } from "@/lib/constants/payment-methods"

const KNOWN_METHOD_ORDER = new Map<string, number>(
  PAYMENT_METHOD_IDS.map((id, index) => [id, index])
)

export interface ExpectedBalanceEntry {
  method: string
  amount: number
}

function sortBalanceEntries(a: ExpectedBalanceEntry, b: ExpectedBalanceEntry) {
  const aOrder = KNOWN_METHOD_ORDER.get(a.method) ?? Number.MAX_SAFE_INTEGER
  const bOrder = KNOWN_METHOD_ORDER.get(b.method) ?? Number.MAX_SAFE_INTEGER
  if (aOrder !== bOrder) return aOrder - bOrder
  return a.method.localeCompare(b.method, "fr")
}

/**
 * Soldes théoriques à afficher : moyens réellement présents (y compris saisie libre)
 * et, par défaut, uniquement ceux dont le montant n'est pas nul.
 */
export function getExpectedBalanceEntries(
  expectedBalances: Record<string, number> | undefined,
  options?: { includeZero?: boolean }
): ExpectedBalanceEntry[] {
  if (!expectedBalances) return []

  const includeZero = options?.includeZero ?? false

  return Object.entries(expectedBalances)
    .map(([method, raw]) => ({ method, amount: Number(raw) || 0 }))
    .filter(({ amount }) => includeZero || amount !== 0)
    .sort(sortBalanceEntries)
}

export const MOVEMENT_SOURCE_LABELS: Record<CashMovement["source"], string> = {
  SALE: "reconciliation.movementSource.SALE",
  EXPENSE: "reconciliation.movementSource.EXPENSE",
  PURCHASE_PAYMENT: "reconciliation.movementSource.PURCHASE_PAYMENT",
  CLIENT_PAYMENT: "reconciliation.movementSource.CLIENT_PAYMENT",
  ADJUSTMENT: "reconciliation.movementSource.ADJUSTMENT",
  FUND_ENTRY: "reconciliation.movementSource.FUND_ENTRY",
  FUND_WITHDRAWAL: "reconciliation.movementSource.FUND_WITHDRAWAL",
}

export const FUND_OPERATION_TYPES = [
  {
    value: "IN" as const,
    labelKey: "cashFund.typeIn.label",
    descriptionKey: "cashFund.typeIn.description",
    hintKey: "cashFund.typeIn.hint",
  },
  {
    value: "OUT" as const,
    labelKey: "cashFund.typeOut.label",
    descriptionKey: "cashFund.typeOut.description",
    hintKey: "cashFund.typeOut.hint",
  },
] as const

export type FundOperationType = (typeof FUND_OPERATION_TYPES)[number]["value"]

export function getMovementStats(movements: CashMovement[]) {
  return movements.reduce(
    (acc, m) => {
      if (m.type === "IN") acc.totalIn += m.amount
      else acc.totalOut += m.amount
      acc.count += 1
      return acc
    },
    { totalIn: 0, totalOut: 0, count: 0 }
  )
}

export function getSessionTotals(session: CashSession) {
  const totalExpected = Object.values(session.expectedBalances).reduce((a, b) => a + b, 0)
  const totalActual = session.actualBalances
    ? Object.values(session.actualBalances).reduce((a, b) => a + b, 0)
    : totalExpected
  const totalVar = session.variances
    ? Object.values(session.variances).reduce((a, b) => a + b, 0)
    : 0
  return { totalExpected, totalActual, totalVar }
}

export function getCashAuditSummary(sessions: CashSession[]) {
  const totalVariance = sessions.reduce((acc, s) => {
    if (!s.variances) return acc
    return acc + Object.values(s.variances).reduce((sum, v) => sum + v, 0)
  }, 0)

  const closedSessions = sessions.filter((s) => s.status === "CLOSED")
  const conformSessions = closedSessions.filter((s) => {
    if (!s.variances) return true
    return Object.values(s.variances).every((v) => v === 0)
  })

  const denominator = closedSessions.length || sessions.length
  const reliabilityPercent =
    denominator > 0 ? Math.round((conformSessions.length / denominator) * 100) : 100

  return {
    totalVariance,
    reliabilityPercent,
    sessionCount: sessions.length,
    closedCount: closedSessions.length,
    conformCount: conformSessions.length,
  }
}
