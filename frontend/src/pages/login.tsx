import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GitHubIcon } from "@/components/ui/github-icon";
import { GoogleIcon } from "@/components/ui/google-icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LanguageSwitcher } from "@/components/language-switcher";
import { getOAuthProviders, startOAuthLogin } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useT, type TKey } from "@/lib/i18n";
import type { OAuthProvidersStatus } from "@/lib/types";

export function LoginPage() {
  const { login, user } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const t = useT();
  const [sp] = useSearchParams();
  const redirectTo = (loc.state as { from?: string } | null)?.from ?? "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providers, setProviders] = useState<OAuthProvidersStatus>({
    google: false,
    github: false,
  });

  useEffect(() => {
    getOAuthProviders()
      .then(setProviders)
      .catch(() => void 0);
  }, []);

  useEffect(() => {
    const code = sp.get("error");
    if (!code) return;
    const ERROR_KEY_MAP: Record<string, TKey> = {
      email_unverified: "login.error.email_unverified",
      email_already_registered: "login.error.email_already_registered",
      account_disabled: "login.error.account_disabled",
      upstream_failure: "login.error.upstream_failure",
      state_expired: "login.error.state_expired",
      signup_rate_limited: "login.error.signup_rate_limited",
    };
    const key: TKey = ERROR_KEY_MAP[code] ?? "login.error.generic";
    setError(t(key));
  }, [sp, t]);

  if (user) return <Navigate to={redirectTo} replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      nav(redirectTo, { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : null;
      setError(msg || t("login.failedFallback"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative">
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-6">
          <BrandMark className="h-7 w-7" />
          <span className="font-semibold">Relay</span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("login.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3">
              {(providers.google || providers.github) && (
                <>
                  <div className="flex flex-col gap-2">
                    {providers.google && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => startOAuthLogin("google", redirectTo)}
                      >
                        <GoogleIcon className="h-4 w-4 mr-2" />
                        {t("login.withGoogle")}
                      </Button>
                    )}
                    {providers.github && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => startOAuthLogin("github", redirectTo)}
                      >
                        <GitHubIcon className="h-4 w-4 mr-2" />
                        {t("login.withGitHub")}
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground my-1">
                    <div className="flex-1 h-px bg-border" />
                    <span>{t("login.orDivider")}</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                </>
              )}

              <form onSubmit={onSubmit} className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email">{t("login.emailLabel")}</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="password">{t("login.passwordLabel")}</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                {error && (
                  <div className="text-xs text-destructive border border-destructive/40 bg-destructive/10 px-2 py-1.5 rounded">
                    {error}
                  </div>
                )}
                <Button type="submit" disabled={busy}>
                  {busy ? t("login.submitting") : t("login.submit")}
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
