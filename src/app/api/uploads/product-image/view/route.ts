import { NextRequest, NextResponse } from "next/server"
import { get } from "@vercel/blob"
import { requireSession } from "@/lib/auth/require-session"

const PATHNAME_PATTERN = /^products\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9._-]+$/

export async function GET(req: NextRequest) {
  const authResult = await requireSession(req)
  if ("response" in authResult) return authResult.response

  try {
    const pathname = req.nextUrl.searchParams.get("pathname")
    if (!pathname || !PATHNAME_PATTERN.test(pathname)) {
      return NextResponse.json({ message: "pathname invalide" }, { status: 400 })
    }

    const result = await get(pathname, { access: "private" })
    if (!result || result.statusCode !== 200 || !result.stream) {
      return NextResponse.json({ message: "Image introuvable" }, { status: 404 })
    }

    return new NextResponse(result.stream, {
      headers: {
        "Content-Type": result.blob.contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch (error: unknown) {
    console.error("Product image view error:", error)
    return NextResponse.json({ message: "Erreur lors de la lecture de l'image" }, { status: 500 })
  }
}
