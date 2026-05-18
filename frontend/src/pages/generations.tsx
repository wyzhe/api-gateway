import { Download, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CodeBlock } from "@/components/ui/code-block";
import { LabeledValue } from "@/components/ui/form-field";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PageHeader } from "@/components/shell";
import { TypeBadge } from "@/components/type-badge";
import { api } from "@/lib/api";
import type { LogDetail, LogSummary as Log } from "@/lib/types";
import { fmtCompactMoney, fmtDate, fmtRelative } from "@/lib/utils";

export function GenerationsPage() {
  const [items, setItems] = useState<Log[]>([]);
  const [selected, setSelected] = useState<LogDetail | null>(null);

  const refresh = () => {
    Promise.all([
      api<Log[]>("/api/logs?type=image&limit=100"),
      api<Log[]>("/api/logs?type=video&limit=100"),
    ])
      .then(([img, vid]) => {
        const merged = [...img, ...vid].sort((a, b) =>
          b.created_at.localeCompare(a.created_at),
        );
        setItems(merged);
      })
      .catch(() => {});
  };

  useEffect(() => {
    refresh();
  }, []);

  const openDetail = async (id: number) => {
    const d = await api<LogDetail>(`/api/logs/${id}`);
    setSelected(d);
  };

  const withAsset = items.filter((i) => i.asset_url);
  const withoutAsset = items.filter((i) => !i.asset_url);

  return (
    <div>
      <PageHeader
        title="Generations"
        subtitle="Image and video outputs from your gateway calls."
        actions={
          <Button variant="outline" onClick={refresh}>Refresh</Button>
        }
      />

      {withAsset.length === 0 && withoutAsset.length === 0 && (
        <Card><CardContent className="text-center text-sm text-muted-foreground py-10">
          No generations yet. Try the Playground.
        </CardContent></Card>
      )}

      {withAsset.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mb-6">
          {withAsset.map((it) => (
            <Card
              key={it.id}
              onClick={() => openDetail(it.id)}
              className="cursor-pointer hover:border-border-strong"
            >
              <div className="bg-surface-2 border-b border-border aspect-video flex items-center justify-center overflow-hidden">
                {it.request_type === "video" ? (
                  <video src={it.asset_url!} controls onClick={(e) => e.stopPropagation()} className="max-w-full max-h-full" />
                ) : (
                  <img src={it.asset_url!} className="max-w-full max-h-full object-cover" />
                )}
              </div>
              <CardContent className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <TypeBadge type={it.request_type} />
                  <span className="mono text-xs">{it.model_name || it.upstream_model}</span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>{fmtCompactMoney(it.cost)}</span>
                  <span>{fmtRelative(it.created_at)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {withoutAsset.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Pending / failed</CardTitle></CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {withoutAsset.map((it) => (
                <li
                  key={it.id}
                  onClick={() => openDetail(it.id)}
                  className="px-4 py-2 flex items-center gap-3 text-xs cursor-pointer hover:bg-surface-2"
                >
                  <TypeBadge type={it.request_type} />
                  <span className="mono">{it.model_name || it.upstream_model}</span>
                  <Badge variant={it.status === "failed" ? "danger" : "info"}>
                    {it.task_status || it.status}
                  </Badge>
                  <span className="text-muted-foreground ml-auto">{fmtRelative(it.created_at)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

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
                <LabeledValue label="Cost" value={fmtCompactMoney(selected.cost)} mono />
                <LabeledValue label="When" value={fmtDate(selected.created_at)} />
                <LabeledValue
                  label="Prompt"
                  value={(selected.request_payload_json?.prompt as string) || "—"}
                />
                <LabeledValue
                  label={selected.request_type === "video" ? "Duration" : "Images"}
                  value={
                    selected.request_type === "video"
                      ? `${selected.video_duration ?? "?"}s`
                      : String(selected.image_count ?? 1)
                  }
                  mono
                />
              </div>

              {selected.asset_url && (
                <div className="mt-4">
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                    <span>Asset</span>
                    <div className="flex gap-2">
                      <a
                        href={selected.asset_url}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:text-foreground inline-flex items-center gap-1"
                      >
                        <ExternalLink className="h-3 w-3" /> open
                      </a>
                      <a
                        href={selected.asset_url}
                        download
                        className="hover:text-foreground inline-flex items-center gap-1"
                      >
                        <Download className="h-3 w-3" /> download
                      </a>
                    </div>
                  </div>
                  {selected.request_type === "video" ? (
                    <video src={selected.asset_url} controls className="rounded-md border border-border max-w-full" />
                  ) : (
                    <img src={selected.asset_url} className="rounded-md border border-border max-w-full" />
                  )}
                </div>
              )}

              <div className="mt-4">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Request</div>
                <CodeBlock lang="json" code={JSON.stringify(selected.request_payload_json, null, 2)} maxHeight="14rem" />
              </div>
              <div className="mt-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Response</div>
                <CodeBlock lang="json" code={JSON.stringify(selected.response_payload_json, null, 2)} maxHeight="20rem" />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
