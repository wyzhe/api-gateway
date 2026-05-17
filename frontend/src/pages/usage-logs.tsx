import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code-block";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TypeBadge } from "@/components/type-badge";
import { PageHeader } from "@/components/shell";
import { api } from "@/lib/api";
import { fmtCompactMoney, fmtDate, fmtRelative } from "@/lib/utils";

type LogSummary = {
  id: number;
  api_key_prefix: string | null;
  model_name: string | null;
  request_type: string;
  upstream_model: string | null;
  status: string;
  task_status: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  image_count: number | null;
  video_duration: string | null;
  cost: string;
  latency_ms: number | null;
  http_status: number | null;
  request_id: string | null;
  error_message: string | null;
  asset_url: string | null;
  created_at: string;
};

type LogDetail = LogSummary & {
  upstream_request_id: string | null;
  request_payload_json: any;
  response_payload_json: any;
};

export function UsageLogsPage() {
  const [rows, setRows] = useState<LogSummary[]>([]);
  const [type, setType] = useState<string>("__all__");
  const [status, setStatus] = useState<string>("__all__");
  const [model, setModel] = useState<string>("");
  const [selected, setSelected] = useState<LogDetail | null>(null);

  const refresh = async () => {
    const qs = new URLSearchParams({ limit: "200" });
    if (type !== "__all__") qs.set("type", type);
    if (status !== "__all__") qs.set("status", status);
    if (model) qs.set("model", model);
    const data = await api<LogSummary[]>(`/api/logs?${qs.toString()}`);
    setRows(data);
  };

  useEffect(() => {
    refresh().catch(() => {});
  }, [type, status, model]);

  const openDetail = async (id: number) => {
    const d = await api<LogDetail>(`/api/logs/${id}`);
    setSelected(d);
  };

  return (
    <div>
      <PageHeader title="Usage / Logs" subtitle="Every gateway request with full payloads and cost." />

      <div className="flex flex-wrap gap-2 mb-3">
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-32"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All types</SelectItem>
            <SelectItem value="text">Text</SelectItem>
            <SelectItem value="image">Image</SelectItem>
            <SelectItem value="video">Video</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All statuses</SelectItem>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="running">Running</SelectItem>
            <SelectItem value="queued">Queued</SelectItem>
          </SelectContent>
        </Select>
        <Input
          placeholder="Filter by model name…"
          className="w-56"
          value={model}
          onChange={(e) => setModel(e.target.value)}
        />
        <Button variant="outline" onClick={() => refresh()}>Refresh</Button>
      </div>

      <div className="rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Model</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Tokens / Assets</TableHead>
              <TableHead>Cost</TableHead>
              <TableHead>Latency</TableHead>
              <TableHead>Key</TableHead>
              <TableHead>When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">
                  No logs match these filters.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow
                key={r.id}
                onClick={() => openDetail(r.id)}
                className="cursor-pointer"
              >
                <TableCell><TypeBadge type={r.request_type} /></TableCell>
                <TableCell className="mono text-xs">{r.model_name || r.upstream_model}</TableCell>
                <TableCell>
                  <Badge variant={r.status === "success" ? "success" : r.status === "failed" ? "danger" : "info"}>
                    {r.status}
                  </Badge>{" "}
                  {r.task_status && (
                    <Badge variant="outline" className="ml-1">{r.task_status}</Badge>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {r.total_tokens && `${r.total_tokens}t`}
                  {r.image_count && `${r.image_count} img`}
                  {r.video_duration && `${r.video_duration}s`}
                  {!r.total_tokens && !r.image_count && !r.video_duration && "—"}
                </TableCell>
                <TableCell className="mono text-xs">{fmtCompactMoney(r.cost)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.latency_ms ?? "—"}ms</TableCell>
                <TableCell className="mono text-xs">{r.api_key_prefix || "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{fmtRelative(r.created_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent>
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <TypeBadge type={selected.request_type} />
                  {selected.model_name || selected.upstream_model}
                  <Badge variant={selected.status === "success" ? "success" : selected.status === "failed" ? "danger" : "info"}>
                    {selected.status}
                  </Badge>
                </SheetTitle>
                <SheetDescription className="mono">{selected.request_id}</SheetDescription>
              </SheetHeader>

              <div className="grid grid-cols-2 gap-3 mt-4 text-xs">
                <Field label="Cost" value={fmtCompactMoney(selected.cost)} mono />
                <Field label="Latency" value={`${selected.latency_ms ?? "—"} ms`} mono />
                <Field label="HTTP" value={String(selected.http_status ?? "—")} mono />
                <Field label="Tokens" value={selected.total_tokens ? `${selected.prompt_tokens} → ${selected.completion_tokens}` : "—"} mono />
                <Field label="API key" value={selected.api_key_prefix || "—"} mono />
                <Field label="Upstream" value={selected.upstream_model || "—"} mono />
                <Field label="When" value={fmtDate(selected.created_at)} />
                <Field label="Upstream request id" value={selected.upstream_request_id || "—"} mono />
              </div>

              {selected.error_message && (
                <div className="mt-4 text-xs border border-destructive/40 bg-destructive/10 text-destructive px-3 py-2 rounded-md">
                  {selected.error_message}
                </div>
              )}

              {selected.asset_url && (
                <div className="mt-4">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Asset</div>
                  {selected.request_type === "video" ? (
                    <video src={selected.asset_url} controls className="rounded-md border border-border max-w-full" />
                  ) : (
                    <a href={selected.asset_url} target="_blank" rel="noreferrer">
                      <img src={selected.asset_url} className="rounded-md border border-border max-w-full" />
                    </a>
                  )}
                </div>
              )}

              <div className="mt-4">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Request</div>
                <CodeBlock
                  lang="json"
                  code={JSON.stringify(selected.request_payload_json, null, 2)}
                  maxHeight="14rem"
                />
              </div>
              <div className="mt-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Response</div>
                <CodeBlock
                  lang="json"
                  code={JSON.stringify(selected.response_payload_json, null, 2)}
                  maxHeight="20rem"
                />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={mono ? "mono" : ""}>{value}</span>
    </div>
  );
}
