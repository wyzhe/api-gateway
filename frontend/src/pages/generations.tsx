import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shell";
import { TypeBadge } from "@/components/type-badge";
import { api } from "@/lib/api";
import type { LogSummary as Log } from "@/lib/types";
import { fmtCompactMoney, fmtRelative } from "@/lib/utils";

export function GenerationsPage() {
  const [items, setItems] = useState<Log[]>([]);

  useEffect(() => {
    // We don't have a /assets endpoint — derive from logs by filtering image/video.
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
  }, []);

  const withAsset = items.filter((i) => i.asset_url);
  const withoutAsset = items.filter((i) => !i.asset_url);

  return (
    <div>
      <PageHeader
        title="Generations"
        subtitle="Image and video outputs from your gateway calls."
      />

      {withAsset.length === 0 && withoutAsset.length === 0 && (
        <Card><CardContent className="text-center text-sm text-muted-foreground py-10">
          No generations yet. Try the Playground.
        </CardContent></Card>
      )}

      {withAsset.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mb-6">
          {withAsset.map((it) => (
            <Card key={it.id}>
              <div className="bg-surface-2 border-b border-border aspect-video flex items-center justify-center overflow-hidden">
                {it.request_type === "video" ? (
                  <video src={it.asset_url!} controls className="max-w-full max-h-full" />
                ) : (
                  <a href={it.asset_url!} target="_blank" rel="noreferrer">
                    <img src={it.asset_url!} className="max-w-full max-h-full object-cover" />
                  </a>
                )}
              </div>
              <CardContent className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <TypeBadge type={it.request_type} />
                  <span className="mono text-xs">{it.model_name || it.upstream_model}</span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {/* prompt lives in request_payload_json which is only in detail view; show model instead */}
                  {it.upstream_model || ""}
                </p>
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
                <li key={it.id} className="px-4 py-2 flex items-center gap-3 text-xs">
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
    </div>
  );
}
