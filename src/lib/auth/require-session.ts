import { NextRequest, NextResponse } from "next/server"
import { getSessionFromRequest, type SessionPayload } from "@/lib/auth/session"

export class SessionRequiredError extends Error {
  constructor() {
    super("Authentication required")
    this.name = "SessionRequiredError"
  }
}

/**
 * Vérifie la session cookie sur une Route Handler (défense en profondeur).
 * Retourne le payload ou une réponse 401.
 */
export async function requireSession(
  req: NextRequest
): Promise<{ session: SessionPayload } | { response: NextResponse }> {
  const session = await getSessionFromRequest(req)
  if (!session) {
    return {
      response: NextResponse.json({ message: "Non authentifié" }, { status: 401 }),
    }
  }
  return { session }
}
