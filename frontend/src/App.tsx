import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAdmin, RequireAuth } from "@/lib/auth";
import { Shell } from "@/components/shell";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LoginPage } from "@/pages/login";
import { DashboardPage } from "@/pages/dashboard";

const LandingPage = lazy(() => import("@/pages/landing").then((m) => ({ default: m.LandingPage })));
const ApiKeysPage = lazy(() => import("@/pages/api-keys").then((m) => ({ default: m.ApiKeysPage })));
const UsageLogsPage = lazy(() => import("@/pages/usage-logs").then((m) => ({ default: m.UsageLogsPage })));
const PlaygroundPage = lazy(() => import("@/pages/playground").then((m) => ({ default: m.PlaygroundPage })));
const ModelsPage = lazy(() => import("@/pages/models").then((m) => ({ default: m.ModelsPage })));
const BillingPage = lazy(() => import("@/pages/billing").then((m) => ({ default: m.BillingPage })));
const GenerationsPage = lazy(() => import("@/pages/generations").then((m) => ({ default: m.GenerationsPage })));
const DocsPage = lazy(() => import("@/pages/docs").then((m) => ({ default: m.DocsPage })));
const AdminOverviewPage = lazy(() => import("@/pages/admin/overview").then((m) => ({ default: m.AdminOverviewPage })));
const AdminUsersPage = lazy(() => import("@/pages/admin/users").then((m) => ({ default: m.AdminUsersPage })));
const AdminModelsPage = lazy(() => import("@/pages/admin/models").then((m) => ({ default: m.AdminModelsPage })));
const AdminProvidersPage = lazy(() => import("@/pages/admin/providers").then((m) => ({ default: m.AdminProvidersPage })));
const AdminLogsPage = lazy(() => import("@/pages/admin/logs").then((m) => ({ default: m.AdminLogsPage })));
const OAuthCompletePage = lazy(() => import("@/pages/oauth-complete").then((m) => ({ default: m.OAuthCompletePage })));
const AccountPage = lazy(() => import("@/pages/account").then((m) => ({ default: m.AccountPage })));

function Workspace({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <Shell>
        <Suspense fallback={<div className="p-8 text-muted-foreground">Loading…</div>}>{children}</Suspense>
      </Shell>
    </RequireAuth>
  );
}

function Admin({ children }: { children: React.ReactNode }) {
  return (
    <RequireAdmin>
      <Shell>
        <Suspense fallback={<div className="p-8 text-muted-foreground">Loading…</div>}>{children}</Suspense>
      </Shell>
    </RequireAdmin>
  );
}

export default function App() {
  return (
    <TooltipProvider delayDuration={300} skipDelayDuration={150}>
      <Suspense fallback={<div className="p-8 text-muted-foreground">Loading…</div>}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/oauth/complete" element={<OAuthCompletePage />} />

          <Route path="/dashboard" element={<Workspace><DashboardPage /></Workspace>} />
          <Route path="/account" element={<Workspace><AccountPage /></Workspace>} />
          <Route path="/keys" element={<Workspace><ApiKeysPage /></Workspace>} />
          <Route path="/logs" element={<Workspace><UsageLogsPage /></Workspace>} />
          <Route path="/playground" element={<Workspace><PlaygroundPage /></Workspace>} />
          <Route path="/models" element={<Workspace><ModelsPage /></Workspace>} />
          <Route path="/billing" element={<Workspace><BillingPage /></Workspace>} />
          <Route path="/generations" element={<Workspace><GenerationsPage /></Workspace>} />
          <Route path="/docs" element={<Workspace><DocsPage /></Workspace>} />

          <Route path="/admin" element={<Admin><AdminOverviewPage /></Admin>} />
          <Route path="/admin/users" element={<Admin><AdminUsersPage /></Admin>} />
          <Route path="/admin/models" element={<Admin><AdminModelsPage /></Admin>} />
          <Route path="/admin/providers" element={<Admin><AdminProvidersPage /></Admin>} />
          <Route path="/admin/logs" element={<Admin><AdminLogsPage /></Admin>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </TooltipProvider>
  );
}
