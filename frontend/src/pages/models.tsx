import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TypeBadge } from "@/components/type-badge";
import { ProviderTag } from "@/components/provider-tag";
import { PageHeader } from "@/components/shell";
import { api } from "@/lib/api";
import { priceLabel } from "@/lib/utils";

type Model = {
  id: number;
  public_name: string;
  upstream_model: string;
  display_provider: string | null;
  type: string;
  display_name: string | null;
  description: string | null;
  pricing_mode: string;
  input_price: string | null;
  output_price: string | null;
  image_price: string | null;
  video_second_price: string | null;
  generation_price: string | null;
  capabilities: any;
};

function ModelGrid({ models }: { models: Model[] }) {
  if (models.length === 0)
    return <div className="text-sm text-muted-foreground py-8 text-center">No models in this group.</div>;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {models.map((m) => (
        <Card key={m.id}>
          <CardHeader className="flex-row items-start justify-between gap-2">
            <div>
              <CardTitle className="mono">{m.public_name}</CardTitle>
              <div className="flex items-center gap-2 mt-1.5">
                <TypeBadge type={m.type} />
                <ProviderTag provider={m.display_provider} />
              </div>
            </div>
            <Badge variant="outline">{m.pricing_mode.replace("_", " ")}</Badge>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {m.description && (
              <p className="text-xs text-muted-foreground">{m.description}</p>
            )}
            <div className="text-xs mono text-foreground">{priceLabel(m)}</div>
            <div className="text-[10px] text-muted-foreground">
              Upstream: <span className="mono">{m.upstream_model}</span>
            </div>
            {m.capabilities && Object.keys(m.capabilities).length > 0 && (
              <div className="text-[10px] text-muted-foreground border-t border-border pt-1.5 mt-1 mono">
                {JSON.stringify(m.capabilities)}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function ModelsPage() {
  const [models, setModels] = useState<Model[]>([]);

  useEffect(() => {
    api<Model[]>("/api/models").then(setModels).catch(() => {});
  }, []);

  const byType = {
    text: models.filter((m) => m.type === "text"),
    image: models.filter((m) => m.type === "image"),
    video: models.filter((m) => m.type === "video"),
    multimodal: models.filter((m) => m.type === "multimodal"),
  };

  return (
    <div>
      <PageHeader
        title="Models"
        subtitle={`${models.length} models available · all routed through APIMart`}
      />

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All ({models.length})</TabsTrigger>
          <TabsTrigger value="text">Text ({byType.text.length})</TabsTrigger>
          <TabsTrigger value="image">Image ({byType.image.length})</TabsTrigger>
          <TabsTrigger value="video">Video ({byType.video.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="all"><ModelGrid models={models} /></TabsContent>
        <TabsContent value="text"><ModelGrid models={byType.text} /></TabsContent>
        <TabsContent value="image"><ModelGrid models={byType.image} /></TabsContent>
        <TabsContent value="video"><ModelGrid models={byType.video} /></TabsContent>
      </Tabs>
    </div>
  );
}
