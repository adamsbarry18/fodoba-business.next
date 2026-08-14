
"use client"

import { useState, useEffect, useCallback } from "react"
import { ReportService } from "@/services/report.service"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import {
  ArrowLeft,
  Loader2,
  TrendingDown,
  TrendingUp,
  UserCheck,
  Truck,
  AlertCircle,
} from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
import { useCurrency } from "@/hooks/use-currency"
import { useT } from "@/i18n/context"
import { PermissionGate } from "@/components/auth/permission-gate"

function FinanceReportContent() {
  const t = useT()
  const { formatAmount } = useCurrency()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<{
    summary: {
      totalClientDebt: number
      totalSupplierDebt: number
      netBalance: number
    }
    clients: Array<{ id: string; name: string; currentDebt: number }>
    suppliers: Array<{ id: string; name: string; currentDebt: number }>
  } | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await ReportService.getFinanceConsolidation()
      setData(res)
    } catch {
      toast.error(t("common.errorConsolidation"))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void loadData()
  }, [loadData])

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="animate-spin text-accent" />
      </div>
    )
  }
  if (!data) return null

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/reports">
              <ArrowLeft className="w-4 h-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t("reports.finance.title")}</h1>
            <p className="text-muted-foreground">{t("reports.finance.subtitle")}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-emerald-200 bg-emerald-50">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="flex items-center text-xs uppercase text-emerald-700">
              <TrendingDown className="mr-1 h-3 w-3" /> {t("reports.finance.statClientDebt")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-2xl font-bold text-emerald-800">
            {formatAmount(data.summary.totalClientDebt)}
          </CardContent>
        </Card>
        <Card className="border-destructive/20 bg-destructive/5">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="flex items-center text-xs uppercase text-destructive">
              <TrendingUp className="mr-1 h-3 w-3" /> {t("reports.finance.statSupplierDebt")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-2xl font-bold text-destructive">
            {formatAmount(data.summary.totalSupplierDebt)}
          </CardContent>
        </Card>
        <Card className="bg-primary/5">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs uppercase text-muted-foreground">
              {t("reports.finance.statNetBalance")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-2xl font-bold">
            {formatAmount(data.summary.netBalance)}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-accent" />
              {t("reports.finance.topClientsTitle")}
            </CardTitle>
            <CardDescription>{t("reports.finance.topClientsDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("reports.finance.colClient")}</TableHead>
                  <TableHead className="text-right">{t("reports.finance.colDebt")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.clients.slice(0, 10).map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-right font-bold text-emerald-600">
                      {formatAmount(c.currentDebt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-destructive" />
              {t("reports.finance.topSuppliersTitle")}
            </CardTitle>
            <CardDescription>{t("reports.finance.topSuppliersDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("reports.finance.colSupplier")}</TableHead>
                  <TableHead className="text-right">{t("reports.finance.colDebt")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.suppliers.slice(0, 10).map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-right font-bold text-destructive">
                      {formatAmount(s.currentDebt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="flex items-center gap-3 p-4">
          <AlertCircle className="h-5 w-5 text-amber-600" />
          <p className="text-xs leading-relaxed text-amber-700">
            <strong>{t("reports.finance.warningTitle")}</strong> {t("reports.finance.warningDesc")}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

export default function FinanceReportPage() {
  return (
    <PermissionGate permission="view:reports:global">
      <FinanceReportContent />
    </PermissionGate>
  )
}

