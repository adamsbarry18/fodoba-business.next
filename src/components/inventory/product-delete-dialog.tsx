"use client"

import { useEffect, useRef, useState } from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Loader2, AlertTriangle } from "lucide-react"
import { ProductService } from "@/services/product.service"
import type { Product } from "@/lib/types"
import {
  getProductDeleteBlockerMessageKey,
  type ProductDeleteBlocker,
} from "@/lib/product-utils"
import { toast } from "sonner"
import { useT } from "@/i18n/context"

interface ProductDeleteDialogProps {
  product: Product | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted?: () => void
}

export function ProductDeleteDialog({
  product,
  open,
  onOpenChange,
  onDeleted,
}: ProductDeleteDialogProps) {
  const t = useT()
  const [blockers, setBlockers] = useState<ProductDeleteBlocker[]>([])
  const [checking, setChecking] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const tRef = useRef(t)
  const onOpenChangeRef = useRef(onOpenChange)
  const onDeletedRef = useRef(onDeleted)

  useEffect(() => {
    tRef.current = t
  }, [t])

  useEffect(() => {
    onOpenChangeRef.current = onOpenChange
  }, [onOpenChange])

  useEffect(() => {
    onDeletedRef.current = onDeleted
  }, [onDeleted])

  useEffect(() => {
    if (open) return
    setBlockers([])
    setChecking(false)
    setDeleting(false)
  }, [open])

  useEffect(() => {
    if (!open || !product?.id) return

    let cancelled = false
    setChecking(true)

    ProductService.getDeleteBlockers(product.id)
      .then((result) => {
        if (!cancelled) setBlockers(result)
      })
      .catch(() => {
        if (!cancelled) {
          toast.error(tRef.current("inventory.deleteCheckError"))
          onOpenChangeRef.current(false)
        }
      })
      .finally(() => {
        if (!cancelled) setChecking(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, product?.id])

  const handleDelete = async () => {
    if (!product || blockers.length > 0 || checking) return

    setDeleting(true)
    try {
      await ProductService.deleteProduct(product.id)
      toast.success(t("inventory.deleteSuccess"))
      onOpenChange(false)
      onDeletedRef.current?.()
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith("PRODUCT_DELETE_BLOCKED:")
      ) {
        const parsed = error.message
          .replace("PRODUCT_DELETE_BLOCKED:", "")
          .split(",")
          .filter(Boolean) as ProductDeleteBlocker[]
        setBlockers(parsed)
        toast.error(t("inventory.deleteBlocked.title"))
      } else {
        toast.error(t("inventory.deleteError"))
      }
    } finally {
      setDeleting(false)
    }
  }

  const isBlocked = !checking && blockers.length > 0
  const canDelete = !checking && blockers.length === 0

  const dialogTitle = checking
    ? t("inventory.confirmDeleteTitle")
    : isBlocked
      ? t("inventory.deleteBlocked.title")
      : t("inventory.confirmDeleteTitle")

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>{dialogTitle}</AlertDialogTitle>
          <AlertDialogDescription>
            {checking ? (
              t("inventory.deleteChecking")
            ) : isBlocked ? (
              t("inventory.deleteBlocked.desc", { name: product?.name ?? "" })
            ) : (
              t("inventory.confirmDeleteDesc", { name: product?.name ?? "" })
            )}
          </AlertDialogDescription>
          {checking && (
            <div className="flex justify-center pt-1">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {isBlocked && (
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {blockers.map((blocker) => (
                <li key={blocker}>
                  {t(getProductDeleteBlockerMessageKey(blocker))}
                </li>
              ))}
            </ul>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-xl" disabled={deleting}>
            {canDelete ? t("common.cancel") : t("common.close")}
          </AlertDialogCancel>
          {canDelete && (
            <AlertDialogAction
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting || checking}
              onClick={(event) => {
                event.preventDefault()
                void handleDelete()
              }}
            >
              {deleting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <AlertTriangle className="mr-2 h-4 w-4" />
              )}
              {t("common.delete")}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
