import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TypeBadge } from "@/components/type-badge";
import { ProviderTag } from "@/components/provider-tag";
import { PageHeader } from "@/components/shell";
import { api } from "@/lib/api";

type Model = {
  id: number;
  public_name: string;
  upstream_model: string;
  display_provider: string | null;
  provider_name: string | null;
  type: string;
  status: string;
  visible: boolean;
  pricing_mode: string;
  input_price: string | null;
  output_price: string | null;
  image_price: string | null;
  video_second_price: string | null;
  generation_price: string | null;
};

export function AdminModelsPage() {
  const [rows, setRows] = useState<Model[]>([]);

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

  return (
    <div>
      <PageHeader title="Models" subtitle={`${rows.length} models. Click status to toggle.`} />

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
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="mono">{m.public_name}</TableCell>
                <TableCell className="mono text-muted-foreground text-xs">{m.upstream_model}</TableCell>
                <TableCell><TypeBadge type={m.type} /></TableCell>
                <TableCell><ProviderTag provider={m.display_provider} /></TableCell>
                <TableCell className="mono text-xs">{priceLabel(m)}</TableCell>
                <TableCell>
                  <Badge variant={m.status === "active" ? "success" : "warn"}>{m.status}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="outline" size="sm" onClick={() => toggle(m)}>
                    {m.status === "active" ? "Disable" : "Enable"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground mt-3">
        Model edits (rename, repricing, capabilities) — POST/PATCH via the API. UI for full edit
        will come in v2.
      </p>
    </div>
  );
}

function priceLabel(m: Model): string {
  switch (m.pricing_mode) {
    case "per_token":
      return `${m.input_price ?? "0"} in · ${m.output_price ?? "0"} out / 1M`;
    case "per_image":
      return `${m.image_price ?? m.generation_price ?? "0"} / image`;
    case "per_second":
      return `${m.video_second_price ?? "0"} / sec`;
    case "per_generation":
      return `${m.generation_price ?? "0"} / gen`;
    default:
      return "—";
  }
}
