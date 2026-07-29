import type { Category } from "@/lib/types"
import { toneFromString } from "@/lib/badge-tones"
import { matchesAnySearchField, prepareSearchQuery } from "@/lib/search-utils"

export interface CategoryNode extends Category {
  children: CategoryNode[]
}

export type CategoryStatusFilter = "all" | "active" | "inactive"

export function buildCategoryTree(
  items: Category[],
  parentId: string | null = null
): CategoryNode[] {
  return items
    .filter((item) => item.parentId === parentId)
    .map((item) => ({
      ...item,
      children: buildCategoryTree(items, item.id),
    }))
}

export function countRootCategories(categories: Category[]): number {
  return categories.filter((c) => !c.parentId).length
}

export function countActiveCategories(categories: Category[]): number {
  return categories.filter((c) => c.active).length
}

export function countWithChildren(categories: Category[]): number {
  const parentIds = new Set(
    categories.map((c) => c.parentId).filter((id): id is string => !!id)
  )
  return parentIds.size
}

export function filterCategoriesForTree(
  categories: Category[],
  search: string,
  status: CategoryStatusFilter
): Category[] {
  const term = prepareSearchQuery(search)
  const matching = new Set<string>()

  for (const cat of categories) {
    const matchesSearch =
      !term || matchesAnySearchField([cat.name, cat.description], term)
    const matchesStatus =
      status === "all" || (status === "active" ? cat.active : !cat.active)
    if (matchesSearch && matchesStatus) matching.add(cat.id)
  }

  const withAncestors = new Set(matching)
  for (const id of matching) {
    let parentId = categories.find((c) => c.id === id)?.parentId ?? null
    while (parentId) {
      withAncestors.add(parentId)
      parentId = categories.find((c) => c.id === parentId)?.parentId ?? null
    }
  }

  return categories.filter((c) => withAncestors.has(c.id))
}

export function getCategoryPath(
  categories: Category[],
  categoryId: string
): string[] {
  const path: string[] = []
  let current = categories.find((c) => c.id === categoryId)
  while (current) {
    path.unshift(current.name)
    current = current.parentId
      ? categories.find((c) => c.id === current!.parentId)
      : undefined
  }
  return path
}

export function getCategoryTone(name: string) {
  return toneFromString(name)
}

export function getDescendantIds(
  categories: Category[],
  categoryId: string
): Set<string> {
  const ids = new Set<string>()
  const collect = (parentId: string) => {
    for (const cat of categories) {
      if (cat.parentId === parentId) {
        ids.add(cat.id)
        collect(cat.id)
      }
    }
  }
  collect(categoryId)
  return ids
}

/** Exclut la catégorie et ses descendants (pour sélection parent). */
export function getEligibleParents(
  categories: Category[],
  excludeId?: string
): Category[] {
  if (!excludeId) return categories
  const excluded = getDescendantIds(categories, excludeId)
  excluded.add(excludeId)
  return categories.filter((c) => !excluded.has(c.id))
}
