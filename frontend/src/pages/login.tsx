import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { GitHubIcon } from "@/components/ui/github-icon";
import { GoogleIcon } from "@/components/ui/google-icon";
import { Input } from "@/components/ui/input";
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

  const hasOAuth = providers.google || providers.github;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative">
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-xs flex flex-col items-center gap-5">
        <div className="h-12 w-12 rounded-xl bg-accent flex items-center justify-center">
          <span className="text-xl font-bold text-accent-foreground">R</span>
        </div>
        <h1 className="text-base font-medium">{t("login.title")}</h1>

        {hasOAuth && (
          <div className="w-full flex flex-col gap-2">
            {providers.google && (
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-full"
                onClick={() => startOAuthLogin("google", redirectTo)}
              >
                <GoogleIcon className="h-4 w-4" />
                {t("login.withGoogle")}
              </Button>
            )}
            {providers.github && (
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-full"
                onClick={() => startOAuthLogin("github", redirectTo)}
              >
                <GitHubIcon className="h-4 w-4" />
                {t("login.withGitHub")}
              </Button>
            )}
          </div>
        )}

        {hasOAuth && (
          <div className="w-full flex items-center gap-3 text-[11px] text-faint">
            <div className="flex-1 h-px bg-border" />
            <span>{t("login.orDivider")}</span>
            <div className="flex-1 h-px bg-border" />
          </div>
        )}

        <form onSubmit={onSubmit} className="w-full flex flex-col gap-3">
          <Input
            type="email"
            autoComplete="email"
            placeholder={t("login.emailLabel")}
            aria-label={t("login.emailLabel")}
            className="h-10 rounded-full px-5"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            type="password"
            autoComplete="current-password"
            placeholder={t("login.passwordLabel")}
            aria-label={t("login.passwordLabel")}
            className="h-10 rounded-full px-5"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && (
            <div className="text-xs text-destructive border border-destructive/40 bg-destructive/10 px-4 py-2 rounded-full text-center">
              {error}
            </div>
          )}
          <Button type="submit" disabled={busy} className="h-10 rounded-full">
            {busy ? t("login.submitting") : t("login.submit")}
          </Button>
        </form>

        <p className="text-[11px] text-faint text-center mt-1">
          {t("login.inviteOnly")}
        </p>
      </div>
    </div>
  );
}
