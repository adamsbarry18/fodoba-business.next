"use client"

import { useMemo, useState } from "react"
import { Search, Users, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { Client } from "@/lib/types"
import { matchesAnySearchField } from "@/lib/search-utils"
import { SearchListAddFooter } from "@/components/forms/search-list-add-footer"
import { useT } from "@/i18n/context"

type PosClientPickerProps = {
  clients: Client[]
  selectedClientId: string
  selectedClient?: Client
  onSelect: (clientId: string) => void
  returnTo: string
  className?: string
}

export function PosClientPicker({
  clients,
  selectedClientId,
  selectedClient,
  onSelect,
  returnTo,
  className,
}: PosClientPickerProps) {
  const t = useT()
  const [clientSearch, setClientSearch] = useState("")
  const [open, setOpen] = useState(false)

  const selectedClientName =
    selectedClientId === "none"
      ? t("pos.walkInClient")
      : selectedClient?.name || t("pos.selectedClient")

  const filteredClients = useMemo(() => {
    if (!clientSearch) return clients.slice(0, 10)
    return clients
      .filter((c) => matchesAnySearchField([c.name, c.phone], clientSearch))
      .slice(0, 10)
  }, [clients, clientSearch])

  const hasClient = selectedClientId !== "none"

  return (
    <div className={cn("relative", className)}>
      <div
        className={cn(
          "flex items-center justify-between gap-3 rounded-2xl border p-3.5",
          hasClient ? "border-primary/20 bg-primary/5" : "border-border bg-muted/30"
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
              hasClient ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
            )}
          >
            <Users className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p
              className={cn(
                "truncate text-sm font-semibold",
                hasClient ? "text-primary" : "text-foreground"
              )}
            >
              {selectedClientName}
            </p>
            {hasClient ? (
              selectedClient?.phone ? (
                <p className="font-mono text-[11px] text-muted-foreground">
                  {selectedClient.phone}
                </p>
              ) : null
            ) : (
              <p className="text-[11px] text-muted-foreground">{t("pos.walkInDefault")}</p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {hasClient && (
            <button
              type="button"
              onClick={() => onSelect("none")}
              className="rounded-full p-1.5 text-primary transition-colors hover:bg-primary/10"
              aria-label={t("pos.resetWalkIn")}
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 rounded-xl px-3 text-xs font-bold"
            onClick={() => setOpen(true)}
          >
            {hasClient ? t("pos.change") : t("pos.choose")}
          </Button>
        </div>
      </div>

      {open && (
        <div className="absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-border bg-popover shadow-lg">
          <div className="border-b border-border p-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder={t("pos.searchClient")}
                className="h-9 rounded-lg pl-9 text-xs"
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-56 divide-y divide-border overflow-y-auto text-xs">
            <button
              type="button"
              onClick={() => {
                onSelect("none")
                setOpen(false)
                setClientSearch("")
              }}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left font-semibold text-foreground transition-colors hover:bg-muted"
            >
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
              <span>{t("pos.walkInClient")}</span>
            </button>
            {filteredClients.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  onSelect(c.id)
                  setOpen(false)
                  setClientSearch("")
                }}
                className="flex w-full flex-col px-4 py-2.5 text-left font-semibold text-foreground transition-colors hover:bg-muted"
              >
                <span>{c.name}</span>
                {c.phone && (
                  <span className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                    {c.phone}
                  </span>
                )}
              </button>
            ))}
            {filteredClients.length === 0 && clientSearch && (
              <div className="px-4 py-2.5 text-center text-[11px] italic text-muted-foreground">
                {t("pos.noClientMatch")}
              </div>
            )}
          </div>
          <SearchListAddFooter entity="client" returnTo={returnTo} />
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
      )}
    </div>
  )
}
