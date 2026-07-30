"use client"

import * as React from "react"
import { Check, ChevronsUpDown, Plus } from "lucide-react"

import { cn } from "@/lib/utils"
import { matchesAnySearchField } from "@/lib/search-utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useT } from "@/i18n/context"

export type ComboboxOption = {
  value: string
  label: string
  keywords?: Array<string | null | undefined>
  disabled?: boolean
}

export interface ComboboxProps {
  options: ComboboxOption[]
  value?: string
  onValueChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: string
  disabled?: boolean
  className?: string
  /** Classes applied to the trigger button (SelectTrigger-compatible). */
  triggerClassName?: string
  /** Allow creating a value not present in `options` (free text). */
  creatable?: boolean
}

const CREATE_ITEM_VALUE = "__combobox_create__"

const Combobox = React.forwardRef<HTMLButtonElement, ComboboxProps>(
  (
    {
      options,
      value,
      onValueChange,
      placeholder,
      searchPlaceholder,
      emptyMessage,
      disabled,
      className,
      triggerClassName,
      creatable = false,
    },
    ref
  ) => {
    const t = useT()
    const [open, setOpen] = React.useState(false)
    const [search, setSearch] = React.useState("")

    const selected = options.find((option) => option.value === value)
    const displayLabel = selected?.label ?? (value ? value : undefined)

    const trimmedSearch = search.trim()
    const exactMatch = options.some(
      (o) =>
        o.value.toLowerCase() === trimmedSearch.toLowerCase() ||
        o.label.toLowerCase() === trimmedSearch.toLowerCase()
    )
    const canCreate = creatable && trimmedSearch.length > 0 && !exactMatch

    React.useEffect(() => {
      if (!open) setSearch("")
    }, [open])

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            ref={ref}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              "h-10 w-full justify-between rounded-xl border-input bg-background px-3 font-normal hover:bg-background",
              !displayLabel && "text-muted-foreground",
              triggerClassName,
              className
            )}
          >
            <span className="truncate">
              {displayLabel ?? placeholder ?? t("common.searchSelect")}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[--radix-popover-trigger-width] rounded-xl p-0"
          align="start"
        >
          <Command
            filter={(itemValue, query) => {
              if (itemValue === CREATE_ITEM_VALUE) return 1
              const option = options.find(
                (o) => o.value.toLowerCase() === itemValue.toLowerCase()
              )
              if (!option) return 0
              return matchesAnySearchField(
                [option.label, ...(option.keywords ?? [])],
                query
              )
                ? 1
                : 0
            }}
          >
            <CommandInput
              placeholder={searchPlaceholder ?? t("common.search")}
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              {!canCreate && (
                <CommandEmpty>{emptyMessage ?? t("common.noResults")}</CommandEmpty>
              )}
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    disabled={option.disabled}
                    onSelect={() => {
                      onValueChange(option.value)
                      setOpen(false)
                    }}
                  >
                    <Check
                      className={cn(
                        "h-4 w-4",
                        value === option.value ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <span className="truncate">{option.label}</span>
                  </CommandItem>
                ))}
                {canCreate && (
                  <CommandItem
                    value={CREATE_ITEM_VALUE}
                    onSelect={() => {
                      onValueChange(trimmedSearch)
                      setOpen(false)
                    }}
                  >
                    <Plus className="h-4 w-4" />
                    <span className="truncate">
                      {t("common.useCustomValue", { value: trimmedSearch })}
                    </span>
                  </CommandItem>
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    )
  }
)
Combobox.displayName = "Combobox"

export { Combobox }
