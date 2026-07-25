"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useAuth } from "@/lib/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Loader2, LogIn, Mail, ShieldCheck } from "lucide-react"
import { toast } from "sonner"
import { AuthPageShell } from "@/components/auth/auth-page-shell"
import { PasswordField } from "@/components/auth/password-field"
import { LoginSchema, type LoginFormValues } from "@/lib/auth-utils"
import { useT } from "@/i18n/context"
import { resolveSafeNextPath } from "@/lib/auth/safe-next-path"
import { LoadingScreen } from "@/components/ui/loading-screen"

function getNextPath() {
  return resolveSafeNextPath(
    new URLSearchParams(window.location.search).get("next")
  )
}

export default function LoginPage() {
  const [loading, setLoading] = useState(false)
  const [redirecting, setRedirecting] = useState(false)
  const { login } = useAuth()
  const t = useT()

  // Session déjà valide (bookmark / retour arrière) — une seule vérif au montage
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch("/api/auth/session", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        })
        if (cancelled || !res.ok) return
        setRedirecting(true)
        window.location.replace(getNextPath())
      } catch {
        // rester sur le formulaire
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(LoginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  })

  const onSubmit = async (values: LoginFormValues) => {
    setLoading(true)
    try {
      await login(values.email.trim(), values.password)
      // Un seul écran de chargement pendant la navigation pleine page
      setRedirecting(true)
      // Laisse le navigateur committer le Set-Cookie (Safari/iOS) avant la nav
      await new Promise((r) => setTimeout(r, 100))
      window.location.assign(getNextPath())
    } catch (error: unknown) {
      const rawMessage = error instanceof Error ? error.message : "auth.error.generic"
      const displayMessage = t.has(rawMessage)
        ? t(rawMessage)
        : rawMessage || t("auth.loginError")
      toast.error(displayMessage)
      setLoading(false)
      setRedirecting(false)
    }
  }

  if (redirecting) {
    return <LoadingScreen message={t("loading.preparingWorkspace")} />
  }

  return (
    <AuthPageShell
      title={t("auth.login")}
      description={t("auth.loginDesc")}
      footer={
        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {t("auth.secureLogin")}
        </p>
      }
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel required className="text-sm font-medium">
                  {t("auth.email")}
                </FormLabel>
                <FormControl>
                  <div className="relative">
                    <Mail
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden
                    />
                    <Input
                      type="email"
                      placeholder={t("auth.emailPlaceholder")}
                      autoComplete="email"
                      className="h-11 rounded-xl pl-10"
                      {...field}
                    />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between gap-2">
                  <FormLabel required className="text-sm font-medium">
                    {t("auth.password")}
                  </FormLabel>
                  <Link
                    href="/forgot-password"
                    prefetch={false}
                    className="text-xs font-semibold text-primary transition-colors hover:text-primary/80"
                  >
                    {t("auth.forgotPassword")}
                  </Link>
                </div>
                <FormControl>
                  <PasswordField
                    placeholder="••••••••"
                    autoComplete="current-password"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            className="mt-2 h-11 w-full rounded-xl font-semibold"
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <LogIn className="mr-2 h-4 w-4" aria-hidden />
            )}
            {t("auth.submit")}
          </Button>
        </form>
      </Form>
    </AuthPageShell>
  )
}
