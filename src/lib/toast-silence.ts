/**
 * Pendant / juste après une déconnexion, les effets et requêtes en cours
 * échouent (Firestore permission-denied, profil null → faux "accès refusé").
 * On ignore les toast.error pendant une courte fenêtre.
 */

let silenceUntil = 0
let patched = false

const SILENCE_MS = 4_000

export function silenceErrorToasts(ms = SILENCE_MS): void {
  silenceUntil = Math.max(silenceUntil, Date.now() + ms)
}

export function areErrorToastsSilenced(): boolean {
  return Date.now() < silenceUntil
}

/** Monkey-patch sonner une seule fois (tous les `import { toast } from "sonner"`). */
export function installErrorToastSilence(toastApi: {
  error: (...args: never[]) => unknown
  dismiss: (id?: string | number) => void
}): void {
  if (patched) return
  patched = true

  const api = toastApi as {
    error: (...args: unknown[]) => unknown
    dismiss: (id?: string | number) => void
  }
  const originalError = api.error.bind(api)

  api.error = (...args: unknown[]) => {
    if (areErrorToastsSilenced()) return ""
    return originalError(...args)
  }
}

export function beginLogoutToastSilence(
  toastApi: { dismiss: (id?: string | number) => void },
  ms = SILENCE_MS
): void {
  silenceErrorToasts(ms)
  toastApi.dismiss()
}
