import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiTile } from "@/components/kpi-tile";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shell";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { fmtCompactMoney, fmtDate, txnBadgeVariant, txnTypeKey } from "@/lib/utils";

type Summary = {
  balance: string;
  today_spend: string;
  month_spend: string;
  today_requests: number;
  month_requests: number;
  spend_by_type: { text: string; image: string; video: string };
};

type Txn = {
  id: number;
  type: string;
  amount: string;
  balance_before: string;
  balance_after: string;
  note: string | null;
  created_at: string;
};

export function BillingPage() {
  const t = useT();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [txns, setTxns] = useState<Txn[]>([]);

  useEffect(() => {
    api<Summary>("/api/billing/summary").then(setSummary).catch(() => {});
    api<Txn[]>("/api/billing/transactions").then(setTxns).catch(() => {});
  }, []);

  return (
    <div>
      <PageHeader
        title={t("billing.title")}
        subtitle={t("billing.subtitle")}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiTile label={t("billing.kpiBalance")} value={fmtCompactMoney(summary?.balance)} />
        <KpiTile
          label={t("billing.kpiTodaySpend")}
          value={fmtCompactMoney(summary?.today_spend)}
          hint={t("billing.kpiRequestsHint", { count: summary?.today_requests ?? 0 })}
        />
        <KpiTile
          label={t("billing.kpiMonthSpend")}
          value={fmtCompactMoney(summary?.month_spend)}
          hint={t("billing.kpiRequestsHint", { count: summary?.month_requests ?? 0 })}
        />
        <KpiTile
          label={t("billing.kpiByTypeMonth")}
          value={
            <div className="text-sm font-normal mt-1 flex flex-col gap-0.5">
              <Row label={t("common.reqType.text")} v={summary?.spend_by_type.text} />
              <Row label={t("common.reqType.image")} v={summary?.spend_by_type.image} />
              <Row label={t("common.reqType.video")} v={summary?.spend_by_type.video} />
            </div>
          }
        />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>{t("billing.transactionsTitle")}</CardTitle>
          <div className="text-xs text-muted-foreground">
            {t("billing.transactionsHint")}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("billing.colType")}</TableHead>
                <TableHead>{t("billing.colAmount")}</TableHead>
                <TableHead>{t("billing.colBalanceAfter")}</TableHead>
                <TableHead>{t("billing.colNote")}</TableHead>
                <TableHead>{t("billing.colWhen")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {txns.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                    {t("billing.emptyTxns")}
                  </TableCell>
                </TableRow>
              )}
              {txns.map((tx) => (
                <TableRow key={tx.id}>
                  <TableCell>
                    <Badge variant={txnBadgeVariant(tx.type)}>
                      {t(txnTypeKey(tx.type))}
                    </Badge>
                  </TableCell>
                  <TableCell className="mono text-xs">
                    {tx.type === "debit" ? "−" : "+"}
                    {fmtCompactMoney(tx.amount)}
                  </TableCell>
                  <TableCell className="mono text-xs">{fmtCompactMoney(tx.balance_after)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{tx.note || "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{fmtDate(tx.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, v }: { label: string; v?: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="mono">{fmtCompactMoney(v)}</span>
    </div>
  );
}
