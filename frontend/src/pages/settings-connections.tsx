import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GitHubIcon } from "@/components/ui/github-icon";
import { GoogleIcon } from "@/components/ui/google-icon";
import {
  detachConnection,
  getOAuthProviders,
  listConnections,
  startOAuthLink,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import type { OAuthIdentity, OAuthProvidersStatus } from "@/lib/types";

export function SettingsConnectionsPage() {
  const { user } = useAuth();
  const t = useT();
  const [identities, setIdentities] = useState<OAuthIdentity[]>([]);
  const [providers, setProviders] = useState<OAuthProvidersStatus>({ google: false, github: false });
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const [ids, prov] = await Promise.all([listConnections(), getOAuthProviders()]);
    setIdentities(ids);
    setProviders(prov);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const canDetach = (id: OAuthIdentity): boolean => {
    if (user?.has_password) return true;
    return identities.filter((x) => x.id !== id.id).length > 0;
  };

  const onDetach = async (id: OAuthIdentity) => {
    if (!confirm(t("settings.connections.detachConfirm").replace("{provider}", id.provider))) return;
    try {
      await detachConnection(id.id);
      await load();
      toast.success(t("settings.connections.detach"));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "detach failed");
    }
  };

  const bind = (provider: "google" | "github") => {
    void startOAuthLink(provider);
  };

  if (loading) return <div className="p-6 text-sm text-muted-foreground">…</div>;

  const linkedProviders = new Set(identities.map((i) => i.provider));

  return (
    <div className="p-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.connections.title")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {identities.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("settings.connections.empty")}</p>
          )}

          {identities.map((id) => (
            <div key={id.id} className="flex items-center justify-between border border-border rounded-md px-3 py-2">
              <div className="flex items-center gap-2 text-sm">
                {id.provider === "google" ? <GoogleIcon className="h-4 w-4" /> : <GitHubIcon className="h-4 w-4" />}
                <span className="capitalize">{id.provider}</span>
                {id.last_login_at && (
                  <span className="text-xs text-muted-foreground">
                    · {new Date(id.last_login_at).toLocaleString()}
                  </span>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDetach(id)}
                disabled={!canDetach(id)}
                title={!canDetach(id) ? t("settings.connections.cannotDetachLast") : undefined}
              >
                {t("settings.connections.detach")}
              </Button>
            </div>
          ))}

          <div className="flex gap-2 pt-2">
            {providers.google && !linkedProviders.has("google") && (
              <Button variant="outline" onClick={() => bind("google")}>
                <GoogleIcon className="h-4 w-4 mr-2" />
                {t("settings.connections.bindGoogle")}
              </Button>
            )}
            {providers.github && !linkedProviders.has("github") && (
              <Button variant="outline" onClick={() => bind("github")}>
                <GitHubIcon className="h-4 w-4 mr-2" />
                {t("settings.connections.bindGitHub")}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
