"use client"

import { useCallback, useEffect, useRef } from "react"

interface UseBarcodeScannerShortcutOptions {
  enabled?: boolean
  onFocus?: () => void
}

/** Raccourci F2 pour focaliser le champ scan (douchette USB). */
export function useBarcodeScannerShortcut(
  inputRef: React.RefObject<HTMLInputElement | null>,
  options?: UseBarcodeScannerShortcutOptions
) {
  const enabled = options?.enabled ?? true
  const onFocusRef = useRef(options?.onFocus)

  useEffect(() => {
    onFocusRef.current = options?.onFocus
  }, [options?.onFocus])

  useEffect(() => {
    if (!enabled) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "F2") return
      e.preventDefault()
      inputRef.current?.focus()
      inputRef.current?.select()
      onFocusRef.current?.()
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [enabled, inputRef])
}

/** Détecte une saisie rapide type douchette (hors champs texte classiques). */
export function useGlobalBarcodeListener(
  onScan: (code: string) => void,
  options?: { enabled?: boolean }
) {
  const bufferRef = useRef("")
  const lastKeyTimeRef = useRef(0)
  const onScanRef = useRef(onScan)

  useEffect(() => {
    onScanRef.current = onScan
  }, [onScan])

  useEffect(() => {
    if (options?.enabled === false) return

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase()
      const isEditable =
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        target?.isContentEditable

      if (isEditable) return

      if (e.key === "Enter") {
        const code = bufferRef.current.trim()
        bufferRef.current = ""
        if (code.length >= 2) {
          e.preventDefault()
          onScanRef.current(code)
        }
        return
      }

      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const now = Date.now()
        if (now - lastKeyTimeRef.current > 80) {
          bufferRef.current = ""
        }
        lastKeyTimeRef.current = now
        bufferRef.current += e.key
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [options?.enabled])
}

export function normalizeScanCode(raw: string): string {
  return raw.trim().replace(/\s+/g, "")
}

export function useBarcodeInputHandler(onScan: (code: string) => void | Promise<void>) {
  return useCallback(
    async (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== "Enter") return
      e.preventDefault()
      const code = normalizeScanCode(e.currentTarget.value)
      if (!code) return
      e.currentTarget.value = ""
      await onScan(code)
    },
    [onScan]
  )
}
