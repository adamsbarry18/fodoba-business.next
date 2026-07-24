/**
 * Validation du paramètre `?next=` (post-login redirect).
 * Edge-safe — utilisable depuis le middleware et le client.
 */

export const DEFAULT_AFTER_LOGIN = "/dashboard"

/** Préfixes des zones authentifiées de l'app (y compris routes dynamiques). */
const ALLOWED_NEXT_PREFIXES = [
  "/dashboard",
  "/pos",
  "/purchases",
  "/inventory",
  "/clients",
  "/suppliers",
  "/expenses",
  "/reconciliation",
  "/reports",
  "/admin",
  "/profile",
] as const

const BLOCKED_NEXT_PREFIXES = ["/login", "/forgot-password", "/api"] as const

function stripQueryAndHash(path: string): { pathname: string; search: string } {
  const hashIndex = path.indexOf("#")
  const withoutHash = hashIndex >= 0 ? path.slice(0, hashIndex) : path
  const qIndex = withoutHash.indexOf("?")
  if (qIndex < 0) return { pathname: withoutHash, search: "" }
  return {
    pathname: withoutHash.slice(0, qIndex),
    search: withoutHash.slice(qIndex),
  }
}

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

/**
 * Retourne le chemin interne sûr, ou `null` si invalide / hors app.
 * Rejette open-redirects, pages auth, API et URLs inconnues.
 */
export function getSafeNextPath(next: string | null | undefined): string | null {
  if (!next) return null

  const trimmed = next.trim()
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("://")) {
    return null
  }

  const { pathname, search } = stripQueryAndHash(trimmed)

  if (!pathname || pathname === "/") return null

  if (BLOCKED_NEXT_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix))) {
    return null
  }

  const allowed = ALLOWED_NEXT_PREFIXES.some((prefix) =>
    matchesPrefix(pathname, prefix)
  )
  if (!allowed) return null

  return `${pathname}${search}`
}

/** Comme `getSafeNextPath`, avec fallback `/dashboard`. */
export function resolveSafeNextPath(next: string | null | undefined): string {
  return getSafeNextPath(next) ?? DEFAULT_AFTER_LOGIN
}
