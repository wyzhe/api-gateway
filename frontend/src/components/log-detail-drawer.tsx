import { Download, ExternalLink } from "lucide-react";
import { useState } from "react";
import { CodeBlock } from "@/components/ui/code-block";
import { DotStatus } from "@/components/dot-status";
import { LabeledValue } from "@/components/ui/form-field";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { TypeBadge } from "@/components/type-badge";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import type { LogDetail } from "@/lib/types";
import { fmtCompactMoney, fmtDate, reqStatusKey } from "@/lib/utils";

export function useLogDetail() {
  const [selected, setSelected] = useState<LogDetail | null>(null);
  const open = async (id: number) => {
    setSelected(await api<LogDetail>(`/api/logs/${id}`));
  };
  const close = () => setSelected(null);
  return { selected, open, close };
}

export function LogDetailDrawer({
  log,
  onClose,
  showPrompt = false,
}: {
  log: LogDetail | null;
  onClose: () => void;
  /** show prompt + duration/n_images fields (used by Generations page). */
  showPrompt?: boolean;
}) {
  const t = useT();
  return (
    <Sheet open={!!log} onOpenChange={(o) => !o && onClose()}>
      <SheetContent>
        {log && (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <TypeBadge type={log.request_type} />
                {log.model_name || log.upstream_model}
                <DotStatus status={log.status} label={t(reqStatusKey(log.status))} />
              </SheetTitle>
              <SheetDescription className="mono">{log.request_id}</SheetDescription>
            </SheetHeader>

            <div className="grid grid-cols-2 gap-3 mt-4 text-xs">
              <LabeledValue label={t("logDrawer.fieldCost")} value={fmtCompactMoney(log.cost)} mono />
              <LabeledValue label={t("logDrawer.fieldLatency")} value={`${log.latency_ms ?? "—"} ${t("logDrawer.latencyUnit")}`} mono />
              <LabeledValue label={t("logDrawer.fieldHttp")} value={String(log.http_status ?? "—")} mono />
              {log.total_tokens != null && (
                <LabeledValue
                  label={t("logDrawer.fieldTokens")}
                  value={`${log.prompt_tokens ?? 0} → ${log.completion_tokens ?? 0}`}
                  mono
                />
              )}
              <LabeledValue label={t("logDrawer.fieldApiKey")} value={log.api_key_prefix || "—"} mono />
              <LabeledValue label={t("logDrawer.fieldUpstream")} value={log.upstream_model || "—"} mono />
              <LabeledValue label={t("logDrawer.fieldWhen")} value={fmtDate(log.created_at)} />
              <LabeledValue label={t("logDrawer.fieldUpstreamRequestId")} value={log.upstream_request_id || "—"} mono />
              {showPrompt && (
                <>
                  <LabeledValue
                    label={t("logDrawer.fieldPrompt")}
                    value={(log.request_payload_json?.prompt as string) || "—"}
                  />
                  <LabeledValue
                    label={log.request_type === "video" ? t("logDrawer.fieldDuration") : t("logDrawer.fieldImages")}
                    value={
                      log.request_type === "video"
                        ? `${log.video_duration ?? "?"}${t("logDrawer.durationUnit")}`
                        : String(log.image_count ?? 1)
                    }
                    mono
                  />
                </>
              )}
            </div>

            {log.error_message && (
              <div className="mt-4 text-xs border border-destructive/40 bg-destructive/10 text-destructive px-3 py-2 rounded-md">
                {log.error_message}
              </div>
            )}

            {log.asset_url && (
              <div className="mt-4">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1.5">
                  <span>{t("logDrawer.sectionAsset")}</span>
                  <div className="flex gap-2">
                    <a
                      href={log.asset_url}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:text-foreground inline-flex items-center gap-1"
                    >
                      <ExternalLink className="h-3 w-3" /> {t("logDrawer.assetOpen")}
                    </a>
                    <a
                      href={log.asset_url}
                      download
                      className="hover:text-foreground inline-flex items-center gap-1"
                    >
                      <Download className="h-3 w-3" /> {t("logDrawer.assetDownload")}
                    </a>
                  </div>
                </div>
                {log.request_type === "video" ? (
                  <video src={log.asset_url} controls className="rounded-md border border-border max-w-full" />
                ) : (
                  <img src={log.asset_url} className="rounded-md border border-border max-w-full" />
                )}
              </div>
            )}

            <div className="mt-4">
              <div className="text-[11px] text-muted-foreground mb-1.5">
                {t("logDrawer.sectionRequest")}
              </div>
              <CodeBlock
                lang="json"
                code={JSON.stringify(log.request_payload_json, null, 2)}
                maxHeight="14rem"
              />
            </div>
            <div className="mt-3">
              <div className="text-[11px] text-muted-foreground mb-1.5">
                {t("logDrawer.sectionResponse")}
              </div>
              <CodeBlock
                lang="json"
                code={JSON.stringify(log.response_payload_json, null, 2)}
                maxHeight="20rem"
              />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
