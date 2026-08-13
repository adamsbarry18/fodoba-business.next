"use client"

import { useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  BarChart3,
  ArrowRight,
  Search,
  ShieldCheck,
  Wallet,
  PieChart,
  Layers,
  Users,
} from "lucide-react"
import Link from "next/link"
import { usePermissions } from "@/hooks/use-permissions"
import {
  REPORT_CARDS,
  REPORT_CATEGORIES,
  REPORT_CATEGORY_LABELS,
  countReportsByCategory,
  filterReports,
  type ReportCategory,
} from "@/lib/report-utils"
import { cn } from "@/lib/utils"
import { useT } from "@/i18n/context"

export default function ReportsPage() {
  const t = useT()
  const { can } = usePermissions()
  const [searchQuery, setSearchQuery] = useState("")
  const [activeCategory, setActiveCategory] = useState<"all" | ReportCategory>("all")

  const reportCategories = useMemo(
    () =>
      REPORT_CATEGORIES.map((cat) => ({
        id: cat.id,
        label: t(cat.labelKey),
      })),
    [t]
  )

  const localizedCards = useMemo(
    () =>
      REPORT_CARDS.map((report) => ({
        ...report,
        title: t(report.title),
        description: t(report.description),
      })),
    [t]
  )

  const allowedReports = useMemo(
    () =>
      filterReports(localizedCards, {
        search: searchQuery,
        category: activeCategory,
        can,
      }),
    [searchQuery, activeCategory, can, localizedCards]
  )

  const stats = useMemo(() => countReportsByCategory(REPORT_CARDS, can), [can])

  const canAccessCash = can("reconcile:cash")

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <BarChart3 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t("reports.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("reports.subtitle")}</p>
          </div>
        </div>
        {canAccessCash && (
          <Button variant="outline" asChild className="rounded-xl font-semibold">
            <Link href="/reconciliation">
              <Wallet className="mr-2 h-4 w-4" />
              {t("reports.treasuryLink")}
            </Link>
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="rounded-2xl border bg-card shadow-sm">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <BarChart3 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {t("reports.statAccessible")}
              </p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border bg-card shadow-sm">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-50 dark:bg-purple-950/40">
              <PieChart className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {t("reports.statFinance")}
              </p>
              <p className="text-2xl font-bold">{stats.finance}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border bg-card shadow-sm">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/40">
              <Layers className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {t("reports.statLogistics")}
              </p>
              <p className="text-2xl font-bold">{stats.logistics}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-2 rounded-2xl border bg-card shadow-sm lg:col-span-1">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-950/40">
              <Users className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {t("reports.statClients")}
              </p>
              <p className="text-2xl font-bold">{stats.clients}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border bg-card shadow-sm">
        <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {reportCategories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={cn(
                  "rounded-xl px-4 py-2 text-xs font-semibold transition-colors",
                  activeCategory === cat.id
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="relative w-full lg:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder={t("reports.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-10 rounded-xl pl-9"
            />
          </div>
        </CardContent>
      </Card>

      {allowedReports.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {allowedReports.map((report) => {
            const IconComponent = report.icon
            return (
              <Card
                key={report.href}
                className="group overflow-hidden rounded-2xl border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                <Link href={report.href} className="flex h-full flex-col">
                  <CardHeader className="flex flex-row items-start gap-4 p-5 pb-2">
                    <div
                      className={cn(
                        "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-105",
                        report.bg,
                        report.color
                      )}
                    >
                      <IconComponent className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <CardTitle className="text-base font-bold group-hover:text-primary">
                        {report.title}
                      </CardTitle>
                      <span className="inline-block rounded-md bg-muted px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {t(REPORT_CATEGORY_LABELS[report.category])}
                      </span>
                    </div>
                  </CardHeader>

                  <CardContent className="flex flex-1 flex-col justify-between p-5 pt-2">
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {report.description}
                    </p>
                    <div className="mt-4 flex items-center justify-between border-t pt-4 text-xs font-semibold text-foreground group-hover:text-primary">
                      <span>{t("reports.viewReport")}</span>
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted group-hover:bg-primary/10">
                        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                      </div>
                    </div>
                  </CardContent>
                </Link>
              </Card>
            )
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed p-16 text-center">
          <Search className="h-12 w-12 text-muted-foreground/30" />
          <div>
            <p className="font-semibold">{t("reports.noReportsFound")}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("reports.noReportsFilterHint")}
            </p>
          </div>
          <Button
            variant="outline"
            className="rounded-xl font-semibold"
            onClick={() => {
              setSearchQuery("")
              setActiveCategory("all")
            }}
          >
            {t("reports.resetFilters")}
          </Button>
        </div>
      )}

      <Card className="overflow-hidden rounded-2xl border border-primary/10 bg-primary/[0.02] shadow-sm">
        <CardContent className="flex flex-col items-start gap-4 p-5 sm:flex-row sm:items-center">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
              {t("reports.complianceTitle")}
            </h4>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("reports.complianceDesc")}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
