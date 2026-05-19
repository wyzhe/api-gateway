import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, setOrChangePassword, setToken, setRefreshToken } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useT, type TKey } from "@/lib/i18n";

const ERR_MAP: Record<string, TKey> = {
  too_short: "settings.security.err.too_short",
  too_long: "settings.security.err.too_long",
  breached: "settings.security.err.breached",
  contains_email: "settings.security.err.contains_email",
};

export function SettingsSecurityPage() {
  const { user, refresh } = useAuth();
  const t = useT();
  const hasPwd = !!user?.has_password;
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
      const resp = await setOrChangePassword(hasPwd ? current : null, next);
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
          const body = e.body as { detail?: string } | string | null;
          const detail =
            typeof body === "object" && body && "detail" in body
              ? (body as { detail?: string }).detail
              : "";
          const code = (detail || "").replace("password_rejected:", "");
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
    <div className="p-6 max-w-md">
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.security.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            {hasPwd && (
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
            )}
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
              {hasPwd ? t("settings.security.changePassword") : t("settings.security.setPassword")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
