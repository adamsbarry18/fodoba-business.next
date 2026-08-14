import type { Sale, Client, Supplier, CashSession } from "@/lib/types"
import { isSaleCountedInRevenue, toSaleDate } from "@/lib/sale-utils"
import {
  format,
  startOfDay,
  endOfDay,
  isWithinInterval,
  subDays,
  subMonths,
  eachMonthOfInterval,
} from "date-fns"
export type DashboardTimeRange = "24h" | "7d" | "30d" | "3m" | "12m"

export const DASHBOARD_TIME_RANGES: { value: DashboardTimeRange; label: string }[] = [
  { value: "24h", label: "dashboard.timeRange.24h" },
  { value: "7d", label: "dashboard.timeRange.7d" },
  { value: "30d", label: "dashboard.timeRange.30d" },
  { value: "3m", label: "dashboard.timeRange.3m" },
  { value: "12m", label: "dashboard.timeRange.12m" },
]

export { toSaleDate }

export function getRangeInterval(timeRange: DashboardTimeRange, now = new Date()) {
  let startDate: Date
  switch (timeRange) {
    case "24h":
      startDate = subDays(now, 1)
      break
    case "7d":
      startDate = subDays(now, 7)
      break
    case "30d":
      startDate = subDays(now, 30)
      break
    case "3m":
      startDate = subMonths(now, 3)
      break
    case "12m":
      startDate = subMonths(now, 12)
      break
    default:
      startDate = subDays(now, 7)
  }
  return { start: startOfDay(startDate), end: endOfDay(now) }
}

export function filterSalesByRange(
  sales: Sale[],
  timeRange: DashboardTimeRange,
  now = new Date()
): Sale[] {
  const interval = getRangeInterval(timeRange, now)
  return sales.filter(
    (s) =>
      isSaleCountedInRevenue(s) &&
      isWithinInterval(toSaleDate(s.timestamp), interval)
  )
}

import type { Locale as DateFnsLocale } from "date-fns"

export function buildDashboardChartData(
  sales: Sale[],
  timeRange: DashboardTimeRange,
  dateLocale?: DateFnsLocale,
  now = new Date()
): { name: string; sales: number }[] {
  const interval = getRangeInterval(timeRange, now)

  const counted = sales.filter(isSaleCountedInRevenue)

  if (timeRange === "12m" || timeRange === "3m") {
    const months = eachMonthOfInterval(interval)
    return months.map((m) => {
      const monthSales = counted
        .filter((s) => format(toSaleDate(s.timestamp), "yyyy-MM") === format(m, "yyyy-MM"))
        .reduce((acc, s) => acc + s.total, 0)
      return { name: format(m, "MMM", { locale: dateLocale }), sales: monthSales }
    })
  }

  const daysCount = timeRange === "24h" ? 1 : timeRange === "7d" ? 7 : 30
  return Array.from({ length: daysCount }, (_, i) => {
    const date = subDays(now, daysCount - 1 - i)
    const daySales = counted
      .filter(
        (s) => format(toSaleDate(s.timestamp), "yyyy-MM-dd") === format(date, "yyyy-MM-dd")
      )
      .reduce((acc, s) => acc + s.total, 0)
    return { name: format(date, "EEE", { locale: dateLocale }), sales: daySales }
  })
}

export function getDashboardStats(
  sales: Sale[],
  clients: Client[],
  suppliers: Supplier[],
  timeRange: DashboardTimeRange,
  cashSession: CashSession | null,
  dateLocale?: DateFnsLocale
) {
  const filteredSales = filterSalesByRange(sales, timeRange)
  const periodRevenue = filteredSales.reduce((acc, s) => acc + s.total, 0)
  const totalClientDebt = clients.reduce((acc, c) => acc + (c.currentDebt || 0), 0)
  const totalSupplierDebt = suppliers.reduce((acc, s) => acc + (s.currentDebt || 0), 0)
  const cashTotal = cashSession
    ? Object.values(cashSession.expectedBalances).reduce((a, b) => a + b, 0)
    : 0
  const cashCash = cashSession?.expectedBalances?.CASH || 0

  return {
    periodRevenue,
    salesCount: filteredSales.length,
    totalClientDebt,
    totalSupplierDebt,
    cashTotal,
    cashCash,
    chartData: buildDashboardChartData(sales, timeRange, dateLocale),
    isCashOpen: !!cashSession,
  }
}
