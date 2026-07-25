import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose"
import { NextRequest, NextResponse } from "next/server"

/**
 * Nom du cookie de session.
 * Pas de préfixe `__Host-` : certains reverse-proxies / runtimes Next ajoutent
 * des attributs incompatibles et le navigateur rejette le cookie silencieusement.
 */
export const SESSION_COOKIE_NAME = "fodoba-session"
/** Ancien nom (migration) — toujours lu puis effacé. */
export const LEGACY_SESSION_COOKIE_NAME = "__Host-fodoba-session"

const FIREBASE_JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"

const MAX_SESSION_SECONDS = 60 * 60 // 1h — Firebase ID tokens
const MIN_SESSION_SECONDS = 60

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null

/** Secure uniquement si la requête est réellement en HTTPS (évite cookie perdu sur HTTP LAN / mobile). */
function isSecureRequest(req?: NextRequest): boolean {
  if (req) {
    const forwarded = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim()
    if (forwarded === "https" || forwarded === "http") {
      return forwarded === "https"
    }
    return req.nextUrl.protocol === "https:"
  }
  return (
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production" ||
    process.env.VERCEL === "1"
  )
}

function getProjectId(): string {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  if (!projectId) {
    throw new Error("NEXT_PUBLIC_FIREBASE_PROJECT_ID is not configured")
  }
  return projectId
}

function getJwks() {
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(FIREBASE_JWKS_URL))
  }
  return jwks
}

export interface SessionPayload {
  uid: string
  email: string | null
  exp: number
}

function toSessionPayload(payload: JWTPayload): SessionPayload {
  const uid = typeof payload.user_id === "string" ? payload.user_id : payload.sub
  if (!uid || typeof uid !== "string") {
    throw new Error("Invalid token: missing uid")
  }
  if (typeof payload.exp !== "number") {
    throw new Error("Invalid token: missing exp")
  }
  return {
    uid,
    email: typeof payload.email === "string" ? payload.email : null,
    exp: payload.exp,
  }
}

/**
 * Vérifie un Firebase ID token via les clés publiques Google (JWKS).
 * Compatible Edge Runtime — pas de firebase-admin.
 */
export async function verifyFirebaseIdToken(token: string): Promise<SessionPayload> {
  const projectId = getProjectId()
  const { payload } = await jwtVerify(token, getJwks(), {
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
    algorithms: ["RS256"],
    clockTolerance: 60,
  })
  return toSessionPayload(payload)
}

export function getSessionTokenFromRequest(req: NextRequest): string | null {
  return (
    req.cookies.get(SESSION_COOKIE_NAME)?.value ??
    req.cookies.get(LEGACY_SESSION_COOKIE_NAME)?.value ??
    null
  )
}

export async function getSessionFromRequest(
  req: NextRequest
): Promise<SessionPayload | null> {
  const token = getSessionTokenFromRequest(req)
  if (!token) return null
  try {
    return await verifyFirebaseIdToken(token)
  } catch (error) {
    console.error(
      "[session] JWT verify failed:",
      error instanceof Error ? error.message : error
    )
    return null
  }
}

export function buildSessionCookieOptions(expiresAt: number, req?: NextRequest) {
  const now = Math.floor(Date.now() / 1000)
  let maxAge = expiresAt - now
  // Token déjà validé par jose : éviter maxAge=0 (cookie immédiatement expiré)
  if (maxAge < MIN_SESSION_SECONDS) {
    maxAge = MAX_SESSION_SECONDS
  }
  maxAge = Math.min(MAX_SESSION_SECONDS, maxAge)

  return {
    httpOnly: true as const,
    secure: isSecureRequest(req),
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  }
}

export function applySessionCookie(
  response: NextResponse,
  idToken: string,
  expiresAt: number,
  req?: NextRequest
): NextResponse {
  const options = buildSessionCookieOptions(expiresAt, req)
  response.cookies.set(SESSION_COOKIE_NAME, idToken, options)
  // Nettoie l'ancien cookie __Host- s'il existe encore (HTTPS only)
  if (isSecureRequest(req)) {
    response.cookies.set(LEGACY_SESSION_COOKIE_NAME, "", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    })
  }
  return response
}

export function clearSessionCookie(
  response: NextResponse,
  req?: NextRequest
): NextResponse {
  const clear = {
    httpOnly: true as const,
    secure: isSecureRequest(req),
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  }
  response.cookies.set(SESSION_COOKIE_NAME, "", clear)
  if (isSecureRequest(req)) {
    response.cookies.set(LEGACY_SESSION_COOKIE_NAME, "", {
      ...clear,
      secure: true,
    })
  }
  return response
}
