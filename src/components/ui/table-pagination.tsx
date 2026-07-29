"use client"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react"
import { useT } from "@/i18n/context"

interface TablePaginationProps {
  page: number
  totalPages: number
  totalItems: number
  rangeStart: number
  rangeEnd: number
  onPageChange: (page: number) => void
  className?: string
  loadingMore?: boolean
}

export function TablePagination({
  page,
  totalPages,
  totalItems,
  rangeStart,
  rangeEnd,
  onPageChange,
  className,
  loadingMore = false,
}: TablePaginationProps) {
  const t = useT()

  if (totalItems === 0) return null

  const showControls = totalPages > 1

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-between gap-3 border-t bg-muted/10 px-4 py-3 sm:flex-row sm:px-6",
        className
      )}
    >
      <p className="text-xs text-muted-foreground">
        {t("table.pagination.range", {
          start: rangeStart,
          end: rangeEnd,
          total: totalItems,
        })}
      </p>

      {showControls ? (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-lg text-xs"
            disabled={page <= 1 || loadingMore}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft className="mr-1 h-3.5 w-3.5" />
            {t("table.pagination.previous")}
          </Button>
          <span className="min-w-[5.5rem] text-center text-xs font-medium text-muted-foreground">
            {t("table.pagination.page", { page, totalPages })}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-lg text-xs"
            disabled={page >= totalPages || loadingMore}
            onClick={() => onPageChange(page + 1)}
          >
            {loadingMore ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : null}
            {t("table.pagination.next")}
            {!loadingMore ? (
              <ChevronRight className="ml-1 h-3.5 w-3.5" />
            ) : null}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
