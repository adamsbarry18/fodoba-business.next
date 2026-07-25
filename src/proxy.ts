import { NextRequest, NextResponse } from "next/server"
import { getSessionFromRequest } from "@/lib/auth/session"
import { getSafeNextPath } from "@/lib/auth/safe-next-path"

/** Chemins accessibles sans cookie de session. */
const PUBLIC_PATHS = new Set(["/login", "/forgot-password"])

const PUBLIC_PREFIXES = ["/api/auth/session"]

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
}

function isApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/")
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Public exact : session API (GET/POST/DELETE) doit rester accessible sans cookie
  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  const session = await getSessionFromRequest(req)

  if (session) {
    return NextResponse.next()
  }

  if (isApiPath(pathname)) {
    return NextResponse.json({ message: "Non authentifié" }, { status: 401 })
  }

  const loginUrl = req.nextUrl.clone()
  loginUrl.pathname = "/login"
  loginUrl.search = ""

  const candidate = `${pathname}${req.nextUrl.search}`
  const safeNext = getSafeNextPath(candidate)
  if (safeNext) {
    loginUrl.searchParams.set("next", safeNext)
  }

  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static, _next/image
     * - favicon / static assets
     * - public uploads served from /uploads
     */
    "/((?!_next/static|_next/image|favicon.ico|images/|uploads/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
}
