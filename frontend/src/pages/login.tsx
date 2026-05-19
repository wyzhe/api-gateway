import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";

export function LoginPage() {
  const { login, user } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const redirectTo = (loc.state as { from?: string } | null)?.from ?? "/dashboard";
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("admin123");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user) return <Navigate to={redirectTo} replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      nav(redirectTo, { replace: true });
    } catch (err: any) {
      setError(err?.message || "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-6">
          <div
            className="h-7 w-7 rounded-md flex items-center justify-center"
            style={{ background: "var(--accent)" }}
          >
            <span className="text-sm font-bold" style={{ color: "var(--accent-foreground)" }}>
              R
            </span>
          </div>
          <span className="font-semibold">Relay</span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">Email</Label>
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
                <Label htmlFor="password">Password</Label>
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
                {busy ? "Signing in…" : "Sign in"}
              </Button>
            </form>
            <p className="text-xs text-muted-foreground mt-4">
              Default admin (from .env): admin@example.com / admin123
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
