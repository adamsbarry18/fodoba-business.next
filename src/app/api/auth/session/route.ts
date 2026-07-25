import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import {
  applySessionCookie,
  clearSessionCookie,
  getSessionFromRequest,
  verifyFirebaseIdToken,
} from "@/lib/auth/session"

const CreateSessionSchema = z.object({
  idToken: z.string().min(1),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = CreateSessionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ message: "idToken requis" }, { status: 400 })
    }

    const { idToken } = parsed.data
    const session = await verifyFirebaseIdToken(idToken)

    const response = NextResponse.json(
      { uid: session.uid, email: session.email },
      { status: 200 }
    )
    return applySessionCookie(response, idToken, session.exp)
  } catch (error: unknown) {
    console.error("Session create error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ message: "Token invalide ou expiré" }, { status: 401 })
  }
}

/** Vérifie si le cookie de session courant est valide. */
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 })
  }
  return NextResponse.json({
    authenticated: true,
    uid: session.uid,
    email: session.email,
  })
}

export async function DELETE() {
  const response = new NextResponse(null, { status: 204 })
  return clearSessionCookie(response)
}
