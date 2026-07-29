import { useEffect, useMemo, useState } from "react"

export const DEFAULT_PAGE_SIZE = 25

export function useClientPagination<T>(
  items: T[],
  options?: {
    pageSize?: number
    resetKey?: string | number
    /**
     * Total réel (ex. count serveur). Si fourni, pages / libellés
     * reflètent ce total même si le buffer local n’est pas encore complet.
     */
    totalCount?: number
  }
) {
  const pageSize = options?.pageSize ?? DEFAULT_PAGE_SIZE
  const [page, setPage] = useState(1)

  useEffect(() => {
    setPage(1)
  }, [options?.resetKey])

  const totalItems =
    typeof options?.totalCount === "number"
      ? Math.max(0, options.totalCount)
      : items.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize) || 1)
  const safePage = Math.min(Math.max(1, page), totalPages)

  const paginatedItems = useMemo(() => {
    const start = (safePage - 1) * pageSize
    return items.slice(start, start + pageSize)
  }, [items, safePage, pageSize])

  const rangeStart = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1
  const rangeEnd = Math.min(safePage * pageSize, totalItems)

  return {
    page: safePage,
    setPage,
    totalPages,
    totalItems,
    pageSize,
    paginatedItems,
    rangeStart,
    rangeEnd,
    hasPagination: totalItems > pageSize,
  }
}
