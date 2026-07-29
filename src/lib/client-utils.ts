import type { Client } from "@/lib/types"
import { matchesAnySearchField, prepareSearchQuery } from "@/lib/search-utils"

export type ClientTypeFilter = "all" | Client["type"]
export type ClientStatusFilter = "all" | Client["status"]
export type ClientDebtFilter = "all" | "with_debt" | "over_limit" | "clear"
export type ClientDeleteBlocker = "debt" | "sales" | "payments"

export const CLIENT_TYPES = [
  {
    value: "particulier" as const,
    label: "Particulier / Revendeur",
    description: "Client de détail ou petit revendeur",
  },
  {
    value: "grossiste" as const,
    label: "Grossiste",
    description: "Achats en volume, conditions spéciales",
  },
] as const

export const CLIENT_STATUSES = [
  {
    value: "actif" as const,
    label: "Actif",
    description: "Peut effectuer des achats à crédit",
  },
  {
    value: "suspendu" as const,
    label: "Suspendu",
    description: "Compte bloqué temporairement",
  },
  {
    value: "vip" as const,
    label: "VIP",
    description: "Accès prioritaire et crédit étendu",
  },
] as const

export function isOverCreditLimit(client: Client): boolean {
  return client.creditCeiling > 0 && client.currentDebt > client.creditCeiling
}

export function getClientInitials(name: string): string {
  return (
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "?"
  )
}

export function countClientsWithDebt(clients: Client[]): number {
  return clients.filter((c) => c.currentDebt > 0).length
}

export function countOverLimit(clients: Client[]): number {
  return clients.filter(isOverCreditLimit).length
}

export function sumClientDebt(clients: Client[]): number {
  return clients.reduce((acc, c) => acc + c.currentDebt, 0)
}

export function filterClients(
  clients: Client[],
  opts: {
    search?: string
    type?: ClientTypeFilter
    status?: ClientStatusFilter
    debt?: ClientDebtFilter
  }
): Client[] {
  const term = prepareSearchQuery(opts.search)
  return clients.filter((c) => {
    const matchesSearch =
      !term ||
      matchesAnySearchField([c.name, c.phone, c.address], term)

    const matchesType =
      !opts.type || opts.type === "all" || c.type === opts.type
    const matchesStatus =
      !opts.status || opts.status === "all" || c.status === opts.status

    let matchesDebt = true
    if (opts.debt === "with_debt") matchesDebt = c.currentDebt > 0
    else if (opts.debt === "over_limit") matchesDebt = isOverCreditLimit(c)
    else if (opts.debt === "clear") matchesDebt = c.currentDebt <= 0

    return matchesSearch && matchesType && matchesStatus && matchesDebt
  })
}

export function getClientDeleteBlockerMessageKey(blocker: ClientDeleteBlocker): string {
  switch (blocker) {
    case "debt":
      return "clients.deleteBlocked.debt"
    case "sales":
      return "clients.deleteBlocked.sales"
    case "payments":
      return "clients.deleteBlocked.payments"
  }
}
