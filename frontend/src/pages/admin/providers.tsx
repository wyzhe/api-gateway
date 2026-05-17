import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shell";
import { api } from "@/lib/api";

type Provider = {
  id: number;
  name: string;
  display_name: string;
  base_url: string;
  status: string;
};

export function AdminProvidersPage() {
  const [rows, setRows] = useState<Provider[]>([]);
  useEffect(() => {
    api<Provider[]>("/api/admin/providers").then(setRows).catch(() => {});
  }, []);

  return (
    <div>
      <PageHeader title="Providers" subtitle="Upstream LLM providers." />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {rows.map((p) => (
          <Card key={p.id}>
            <CardHeader className="flex-row items-start justify-between">
              <div>
                <CardTitle>{p.display_name}</CardTitle>
                <div className="text-xs text-muted-foreground mt-1 mono">{p.name}</div>
              </div>
              <Badge variant={p.status === "active" ? "success" : "warn"}>{p.status}</Badge>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <div className="text-xs text-muted-foreground">Base URL</div>
              <div className="mono text-xs break-all">{p.base_url}</div>
              <div className="text-xs text-muted-foreground mt-2">API key</div>
              <div className="mono text-xs text-muted-foreground">
                Configured via <span className="text-foreground">APIMART_API_KEY</span> env. Not shown
                in the UI for safety.
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
