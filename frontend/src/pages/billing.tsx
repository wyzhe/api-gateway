import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiTile } from "@/components/kpi-tile";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shell";
import { api } from "@/lib/api";
import { fmtCompactMoney, fmtDate } from "@/lib/utils";

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
  const [summary, setSummary] = useState<Summary | null>(null);
  const [txns, setTxns] = useState<Txn[]>([]);

  useEffect(() => {
    api<Summary>("/api/billing/summary").then(setSummary).catch(() => {});
    api<Txn[]>("/api/billing/transactions").then(setTxns).catch(() => {});
  }, []);

  return (
    <div>
      <PageHeader
        title="Billing"
        subtitle="Pay-as-you-go credit. Contact admin to request more."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiTile label="Balance" value={fmtCompactMoney(summary?.balance)} />
        <KpiTile label="Today spend" value={fmtCompactMoney(summary?.today_spend)} hint={`${summary?.today_requests ?? 0} requests`} />
        <KpiTile label="Month spend" value={fmtCompactMoney(summary?.month_spend)} hint={`${summary?.month_requests ?? 0} requests`} />
        <KpiTile
          label="By type (month)"
          value={
            <div className="text-sm font-normal mt-1 flex flex-col gap-0.5">
              <Row label="text" v={summary?.spend_by_type.text} />
              <Row label="image" v={summary?.spend_by_type.image} />
              <Row label="video" v={summary?.spend_by_type.video} />
            </div>
          }
        />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Transactions</CardTitle>
          <div className="text-xs text-muted-foreground">
            Need more credit? Contact your admin or request via Slack.
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Balance after</TableHead>
                <TableHead>Note</TableHead>
                <TableHead>When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {txns.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                    No transactions yet.
                  </TableCell>
                </TableRow>
              )}
              {txns.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <Badge variant={t.type === "recharge" ? "success" : t.type === "debit" ? "warn" : "default"}>
                      {t.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="mono text-xs">
                    {t.type === "debit" ? "−" : "+"}
                    {fmtCompactMoney(t.amount)}
                  </TableCell>
                  <TableCell className="mono text-xs">{fmtCompactMoney(t.balance_after)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{t.note || "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{fmtDate(t.created_at)}</TableCell>
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
