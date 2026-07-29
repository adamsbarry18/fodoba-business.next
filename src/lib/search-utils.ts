/**
 * Normalisation de recherche partagée (casse + accents).
 * Ex. "Café" ≡ "cafe" ≡ "CAFE"
 */

export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

/** Prépare la requête saisie par l’utilisateur. */
export function prepareSearchQuery(raw: string | null | undefined): string {
  return normalizeSearchText(raw ?? "")
}

/** `haystack` contient-il `query` (déjà normalisée ou brute) ? */
export function matchesSearchQuery(
  haystack: string | null | undefined,
  query: string
): boolean {
  const q = prepareSearchQuery(query)
  if (!q) return true
  return normalizeSearchText(haystack ?? "").includes(q)
}

/** Au moins un champ matche la requête. */
export function matchesAnySearchField(
  fields: Array<string | null | undefined>,
  query: string
): boolean {
  const q = prepareSearchQuery(query)
  if (!q) return true
  return fields.some((field) => normalizeSearchText(field ?? "").includes(q))
}
