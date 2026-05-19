import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { exchangeOAuth, setToken, setRefreshToken } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";

export function OAuthCompletePage() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const { refresh } = useAuth();
  const t = useT();
  const [state, setState] = useState<"working" | "error">("working");
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    const returnTo = sp.get("return_to") || "/dashboard";
    (async () => {
      try {
        const resp = await exchangeOAuth();
        setToken(resp.access_token);
        setRefreshToken(resp.refresh_token);
        await refresh();
        nav(returnTo, { replace: true });
      } catch (e: unknown) {
        setState("error");
        setErrMsg(e instanceof Error ? e.message : "Unknown error");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state === "working") {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        {t("oauth.completing")}
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-sm flex flex-col items-center gap-3">
        <h2 className="text-lg font-semibold">{t("oauth.failedTitle")}</h2>
        <p className="text-sm text-muted-foreground">{errMsg ?? t("oauth.failedMsg")}</p>
        <Button asChild>
          <Link to="/login">{t("oauth.backToLogin")}</Link>
        </Button>
      </div>
    </div>
  );
}
