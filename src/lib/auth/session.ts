import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose"
import { NextRequest, NextResponse } from "next/server"

/** Cookie name: `__Host-` prefix requires Secure + Path=/ + no Domain (prod HTTPS). */
export const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production" ? "__Host-fodoba-session" : "fodoba-session"

const FIREBASE_JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"

const MAX_SESSION_SECONDS = 60 * 60 // 1h — Firebase ID tokens

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null

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
  })
  return toSessionPayload(payload)
}

export function getSessionTokenFromRequest(req: NextRequest): string | null {
  return req.cookies.get(SESSION_COOKIE_NAME)?.value ?? null
}

export async function getSessionFromRequest(
  req: NextRequest
): Promise<SessionPayload | null> {
  const token = getSessionTokenFromRequest(req)
  if (!token) return null
  try {
    return await verifyFirebaseIdToken(token)
  } catch {
    return null
  }
}

export function buildSessionCookieOptions(expiresAt: number) {
  const maxAge = Math.max(
    0,
    Math.min(MAX_SESSION_SECONDS, expiresAt - Math.floor(Date.now() / 1000))
  )
  const isProd = process.env.NODE_ENV === "production"

  return {
    httpOnly: true as const,
    secure: isProd,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  }
}

export function applySessionCookie(
  response: NextResponse,
  idToken: string,
  expiresAt: number
): NextResponse {
  response.cookies.set(SESSION_COOKIE_NAME, idToken, buildSessionCookieOptions(expiresAt))
  return response
}

export function clearSessionCookie(response: NextResponse): NextResponse {
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  })
  return response
}
