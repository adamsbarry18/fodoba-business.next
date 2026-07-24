import { NextRequest, NextResponse } from "next/server"
import { put } from "@vercel/blob"
import { mkdir, writeFile } from "fs/promises"
import path from "path"
import { requireSession } from "@/lib/auth/require-session"

const MAX_SIZE = 4.5 * 1024 * 1024
const ALLOWED_EXT = new Set(["jpg", "jpeg", "png", "webp", "gif"])
const BLOB_ACCESS = process.env.BLOB_ACCESS === "public" ? "public" : "private"

function productImageViewUrl(pathname: string): string {
  return `/api/uploads/product-image/view?pathname=${encodeURIComponent(pathname)}`
}

function resolveExtension(file: File): string {
  const fromName = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "")
  if (fromName && ALLOWED_EXT.has(fromName)) return fromName === "jpeg" ? "jpg" : fromName

  const fromType = file.type.split("/")[1]?.toLowerCase()
  if (fromType === "jpeg") return "jpg"
  if (fromType && ALLOWED_EXT.has(fromType)) return fromType

  return "jpg"
}

async function saveLocal(productId: string, file: File, filename: string): Promise<string> {
  const uploadDir = path.join(process.cwd(), "public", "uploads", "products", productId)
  await mkdir(uploadDir, { recursive: true })
  await writeFile(path.join(uploadDir, filename), Buffer.from(await file.arrayBuffer()))
  return `/uploads/products/${productId}/${filename}`
}

export async function POST(req: NextRequest) {
  const authResult = await requireSession(req)
  if ("response" in authResult) return authResult.response

  try {
    const formData = await req.formData()
    const productId = formData.get("productId")
    const file = formData.get("file")

    if (typeof productId !== "string" || !productId) {
      return NextResponse.json({ message: "productId requis" }, { status: 400 })
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(productId)) {
      return NextResponse.json({ message: "productId invalide" }, { status: 400 })
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ message: "Fichier requis" }, { status: 400 })
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { message: "Image trop volumineuse (max 4,5 Mo via serveur)" },
        { status: 400 }
      )
    }
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ message: "Le fichier doit être une image" }, { status: 400 })
    }

    const ext = resolveExtension(file)
    const filename = `${Date.now()}.${ext}`
    const pathname = `products/${productId}/${filename}`

    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const blob = await put(pathname, file, {
        access: BLOB_ACCESS,
        addRandomSuffix: false,
      })
      const url =
        BLOB_ACCESS === "public" ? blob.url : productImageViewUrl(blob.pathname)
      return NextResponse.json({ url })
    }

    const url = await saveLocal(productId, file, filename)
    return NextResponse.json({ url })
  } catch (error: unknown) {
    console.error("Product image upload error:", error)
    return NextResponse.json({ message: "Erreur lors de l'enregistrement de l'image" }, { status: 500 })
  }
}
