import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { PageHeader } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GitHubIcon } from "@/components/ui/github-icon";
import { GoogleIcon } from "@/components/ui/google-icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip } from "@/components/ui/tooltip";
import {
  ApiError,
  detachConnection,
  getOAuthProviders,
  listConnections,
  setOrChangePassword,
  setRefreshToken,
  setToken,
  startOAuthLink,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useT, type TKey } from "@/lib/i18n";
import type { OAuthIdentity, OAuthProvidersStatus } from "@/lib/types";

const ERR_MAP: Record<string, TKey> = {
  too_short: "settings.security.err.too_short",
  too_long: "settings.security.err.too_long",
  breached: "settings.security.err.breached",
  contains_email: "settings.security.err.contains_email",
};

export function AccountPage() {
  const { user } = useAuth();
  const t = useT();

  return (
    <div>
      <PageHeader title={t("nav.accountSettings")} />
      <div className="flex flex-col gap-4 max-w-2xl">
        {user?.has_password && <PasswordCard />}
        <ConnectionsCard />
      </div>
    </div>
  );
}

function PasswordCard() {
  const { refresh } = useAuth();
  const t = useT();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (next !== confirm) {
      setErr(t("settings.security.err.mismatch"));
      return;
    }
    setBusy(true);
    try {
      const resp = await setOrChangePassword(current, next);
      setToken(resp.access_token);
      setRefreshToken(resp.refresh_token);
      await refresh();
      toast.success(t("settings.security.success"));
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        if (e.status === 401) {
          setErr(t("settings.security.err.wrongCurrent"));
        } else if (e.status === 422) {
          const code = e.message.replace("password_rejected:", "");
          const key = ERR_MAP[code];
          setErr(key ? t(key) : (e.message || "rejected"));
        } else {
          setErr(e.message);
        }
      } else {
        setErr(e instanceof Error ? e.message : "unknown");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.security.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-3 max-w-sm">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="current">{t("settings.security.current")}</Label>
            <Input
              id="current"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new">{t("settings.security.new")}</Label>
            <Input
              id="new"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
              minLength={12}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirm">{t("settings.security.confirm")}</Label>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={12}
            />
          </div>
          <p className="text-xs text-muted-foreground">{t("settings.security.tip")}</p>
          {err && (
            <div className="text-xs text-destructive border border-destructive/40 bg-destructive/10 px-2 py-1.5 rounded">
              {err}
            </div>
          )}
          <Button type="submit" disabled={busy}>
            {t("settings.security.changePassword")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function ConnectionsCard() {
  const { user } = useAuth();
  const t = useT();
  const [searchParams, setSearchParams] = useSearchParams();
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

  // The OAuth link callback redirects back here with ?linked= or ?error=.
  useEffect(() => {
    const linked = searchParams.get("linked");
    const error = searchParams.get("error");
    if (!linked && !error) return;
    if (linked) {
      toast.success(t("settings.connections.linkSuccess", { provider: linked }));
    } else if (error === "provider_in_use") {
      toast.error(t("settings.connections.linkErrInUse"));
    } else {
      toast.error(t("settings.connections.linkErrExpired"));
    }
    searchParams.delete("linked");
    searchParams.delete("error");
    setSearchParams(searchParams, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canDetach = (id: OAuthIdentity): boolean => {
    if (user?.has_password) return true;
    return identities.filter((x) => x.id !== id.id).length > 0;
  };

  const onDetach = async (id: OAuthIdentity) => {
    if (!confirm(t("settings.connections.detachConfirm", { provider: id.provider }))) return;
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

  const linkedProviders = new Set(identities.map((i) => i.provider));
  const canBindGoogle = providers.google && !linkedProviders.has("google");
  const canBindGitHub = providers.github && !linkedProviders.has("github");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.connections.title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {loading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : (
          <>
            {identities.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("settings.connections.empty")}</p>
            )}

            {identities.map((id) => (
              <div
                key={id.id}
                className="flex items-center justify-between border border-border rounded-md px-3 py-2"
              >
                <div className="flex items-center gap-2 text-sm">
                  {id.provider === "google" ? (
                    <GoogleIcon className="h-4 w-4" />
                  ) : (
                    <GitHubIcon className="h-4 w-4" />
                  )}
                  <span className="capitalize">{id.provider}</span>
                  {id.last_login_at && (
                    <span className="text-xs text-muted-foreground">
                      · {new Date(id.last_login_at).toLocaleString()}
                    </span>
                  )}
                </div>
                <Tooltip content={!canDetach(id) ? t("settings.connections.cannotDetachLast") : undefined}>
                  <span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDetach(id)}
                      disabled={!canDetach(id)}
                    >
                      {t("settings.connections.detach")}
                    </Button>
                  </span>
                </Tooltip>
              </div>
            ))}

            {(canBindGoogle || canBindGitHub) && (
              <div className="flex gap-2 pt-2">
                {canBindGoogle && (
                  <Button variant="outline" onClick={() => bind("google")}>
                    <GoogleIcon className="h-4 w-4 mr-2" />
                    {t("settings.connections.bindGoogle")}
                  </Button>
                )}
                {canBindGitHub && (
                  <Button variant="outline" onClick={() => bind("github")}>
                    <GitHubIcon className="h-4 w-4 mr-2" />
                    {t("settings.connections.bindGitHub")}
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
