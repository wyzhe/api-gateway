import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TypeBadge } from "@/components/type-badge";
import { ProviderTag } from "@/components/provider-tag";
import { PageHeader } from "@/components/shell";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import type { Model } from "@/lib/types";
import { priceLabel, pricingModeKey } from "@/lib/utils";

function ModelGrid({ models }: { models: Model[] }) {
  const t = useT();
  if (models.length === 0)
    return <div className="text-sm text-muted-foreground py-8 text-center">{t("models.empty")}</div>;
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
            <Badge variant="outline">{t(pricingModeKey(m.pricing_mode))}</Badge>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {m.description && (
              <p className="text-xs text-muted-foreground">{m.description}</p>
            )}
            <div className="text-xs mono text-foreground">{priceLabel(m)}</div>
            <div className="text-[10px] text-muted-foreground">
              {t("models.upstreamLabel")} <span className="mono">{m.upstream_model}</span>
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
  const t = useT();
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
      <PageHeader title={t("models.title")} />

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">{t("models.tabAll", { count: models.length })}</TabsTrigger>
          <TabsTrigger value="text">{t("models.tabText", { count: byType.text.length })}</TabsTrigger>
          <TabsTrigger value="image">{t("models.tabImage", { count: byType.image.length })}</TabsTrigger>
          <TabsTrigger value="video">{t("models.tabVideo", { count: byType.video.length })}</TabsTrigger>
        </TabsList>
        <TabsContent value="all"><ModelGrid models={models} /></TabsContent>
        <TabsContent value="text"><ModelGrid models={byType.text} /></TabsContent>
        <TabsContent value="image"><ModelGrid models={byType.image} /></TabsContent>
        <TabsContent value="video"><ModelGrid models={byType.video} /></TabsContent>
      </Tabs>
    </div>
  );
}
