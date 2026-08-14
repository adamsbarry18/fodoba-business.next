import { CashSession, CashMovement } from "@/lib/types"
import type { Role } from "@/lib/types"
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

  const closedSessions = sessions.filter((s) => isCashSessionClosed(s))
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

const OPEN_STATUS_ALIASES = new Set(["OPEN", "open"])
const CLOSED_STATUS_ALIASES = new Set(["CLOSED", "closed"])

export function isCashSessionOpen(session: Pick<CashSession, "status"> | null | undefined): boolean {
  if (!session?.status) return false
  return OPEN_STATUS_ALIASES.has(String(session.status))
}

export function isCashSessionClosed(session: Pick<CashSession, "status"> | null | undefined): boolean {
  if (!session?.status) return false
  return CLOSED_STATUS_ALIASES.has(String(session.status))
}

export function cashSessionStatusBadgeValue(
  session: Pick<CashSession, "status"> | null | undefined
): "OPEN" | "CLOSED" {
  return isCashSessionOpen(session) ? "OPEN" : "CLOSED"
}

function sessionOpenedAtMs(session: Pick<CashSession, "openedAt">): number {
  return toCashSessionDate(session.openedAt)?.getTime() ?? 0
}

export function pickLatestOpenSession(sessions: CashSession[]): CashSession | null {
  const open = sessions.filter(isCashSessionOpen)
  if (open.length === 0) return null
  return [...open].sort((a, b) => sessionOpenedAtMs(b) - sessionOpenedAtMs(a))[0] ?? null
}

/** Date de session sûre (évite « Invalid Date » si openedAt est absent ou mal formé). */
export function toCashSessionDate(ts: unknown): Date | null {
  if (ts == null) return null
  if (typeof ts === "object" && "toDate" in ts) {
    const toDate = (ts as { toDate?: () => Date }).toDate
    if (typeof toDate === "function") {
      const date = toDate.call(ts)
      return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null
    }
  }
  if (typeof ts === "object" && ts !== null && "seconds" in ts) {
    const seconds = (ts as { seconds: unknown }).seconds
    if (typeof seconds === "number") {
      const date = new Date(seconds * 1000)
      return Number.isNaN(date.getTime()) ? null : date
    }
  }
  if (typeof ts === "string" || typeof ts === "number" || ts instanceof Date) {
    const date = new Date(ts)
    return Number.isNaN(date.getTime()) ? null : date
  }
  return null
}

function isManagerOrAdmin(role: Role | null | undefined): boolean {
  return role === "admin" || role === "manager"
}

/** Gérant / admin : tout le tiroir. Vendeur : seulement s'il a ouvert la session. */
export function canViewCashBalances(
  role: Role | null | undefined,
  session: Pick<CashSession, "openedBy"> | null | undefined,
  uid: string | undefined
): boolean {
  if (isManagerOrAdmin(role)) return true
  if (!session || !uid) return false
  return session.openedBy === uid
}

export function canCloseCashSession(
  role: Role | null | undefined,
  session: CashSession | null | undefined,
  uid: string | undefined
): boolean {
  if (!isCashSessionOpen(session)) return false
  return canViewCashBalances(role, session, uid)
}

export function canManageCashFund(
  role: Role | null | undefined,
  session: CashSession | null | undefined,
  uid: string | undefined
): boolean {
  return canCloseCashSession(role, session, uid)
}

export function canViewCashHistory(role: Role | null | undefined): boolean {
  return isManagerOrAdmin(role)
}

export const CASH_OPEN_STATUS_VALUES = ["OPEN", "open"] as const

