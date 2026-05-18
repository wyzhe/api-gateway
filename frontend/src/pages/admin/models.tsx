import { Activity } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TypeBadge } from "@/components/type-badge";
import { ProviderTag } from "@/components/provider-tag";
import { PageHeader } from "@/components/shell";
import { api } from "@/lib/api";
import type { HealthCheckResult, Model } from "@/lib/types";
import { priceLabel } from "@/lib/utils";

export function AdminModelsPage() {
  const [rows, setRows] = useState<Model[]>([]);
  const [health, setHealth] = useState<Record<number, HealthCheckResult | "pending">>({});

  const refresh = async () => {
    const data = await api<Model[]>("/api/admin/models");
    setRows(data);
  };
  useEffect(() => {
    refresh().catch(() => {});
  }, []);

  const toggle = async (m: Model) => {
    const a = m.status === "active" ? "disable" : "enable";
    await api(`/api/admin/models/${m.id}/${a}`, { method: "POST" });
    toast.success(`Model ${a}d`);
    void refresh();
  };

  const ping = async (m: Model) => {
    setHealth((h) => ({ ...h, [m.id]: "pending" }));
    try {
      const result = await api<HealthCheckResult>(`/api/admin/models/${m.id}/healthcheck`, { method: "POST" });
      setHealth((h) => ({ ...h, [m.id]: result }));
      if (result.ok) toast.success(`${m.public_name}: ${result.latency_ms}ms ✓`);
      else toast.error(`${m.public_name}: ${result.error || "failed"}`);
    } catch (e: any) {
      setHealth((h) => ({
        ...h,
        [m.id]: {
          model_id: m.id,
          public_name: m.public_name,
          upstream_model: m.upstream_model,
          type: m.type,
          ok: false,
          status_code: null,
          latency_ms: 0,
          error: String(e?.message || e),
          sample: null,
        },
      }));
    }
  };

  return (
    <div>
      <PageHeader title="Models" subtitle={`${rows.length} models. Ping calls the upstream — uses a tiny bit of credit.`} />

      <div className="rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Public name</TableHead>
              <TableHead>Upstream</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Provider tag</TableHead>
              <TableHead>Pricing</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Health</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((m) => {
              const h = health[m.id];
              return (
                <TableRow key={m.id}>
                  <TableCell className="mono">{m.public_name}</TableCell>
                  <TableCell className="mono text-muted-foreground text-xs">{m.upstream_model}</TableCell>
                  <TableCell><TypeBadge type={m.type} /></TableCell>
                  <TableCell><ProviderTag provider={m.display_provider} /></TableCell>
                  <TableCell className="mono text-xs">{priceLabel(m)}</TableCell>
                  <TableCell>
                    <Badge variant={m.status === "active" ? "success" : "warn"}>{m.status}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    {h === "pending" && <span className="text-muted-foreground">pinging…</span>}
                    {h && h !== "pending" && (
                      <span title={h.error || h.sample || ""}>
                        <Badge variant={h.ok ? "success" : "danger"}>{h.ok ? "ok" : "fail"}</Badge>
                        <span className="mono ml-1.5 text-muted-foreground">{h.latency_ms}ms</span>
                      </span>
                    )}
                    {!h && <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-1">
                      <Button variant="outline" size="sm" onClick={() => ping(m)} disabled={h === "pending"}>
                        <Activity className="h-3.5 w-3.5" /> Ping
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => toggle(m)}>
                        {m.status === "active" ? "Disable" : "Enable"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground mt-3">
        Ping a text model = 1-token chat completion. Ping image/video = a submit only (we don't wait for the task to finish, so cost is whatever a single submission credit costs — typically 0 if the upstream rejects).
      </p>
    </div>
  );
}
