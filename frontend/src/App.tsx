import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAdmin, RequireAuth } from "@/lib/auth";
import { Shell } from "@/components/shell";
import { LoginPage } from "@/pages/login";
import { DashboardPage } from "@/pages/dashboard";
import { ApiKeysPage } from "@/pages/api-keys";
import { UsageLogsPage } from "@/pages/usage-logs";
import { PlaygroundPage } from "@/pages/playground";
import { ModelsPage } from "@/pages/models";
import { BillingPage } from "@/pages/billing";
import { GenerationsPage } from "@/pages/generations";
import { DocsPage } from "@/pages/docs";
import { AdminOverviewPage } from "@/pages/admin/overview";
import { AdminUsersPage } from "@/pages/admin/users";
import { AdminModelsPage } from "@/pages/admin/models";
import { AdminProvidersPage } from "@/pages/admin/providers";
import { AdminLogsPage } from "@/pages/admin/logs";

function Workspace({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <Shell>{children}</Shell>
    </RequireAuth>
  );
}

function Admin({ children }: { children: React.ReactNode }) {
  return (
    <RequireAdmin>
      <Shell>{children}</Shell>
    </RequireAdmin>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/login" element={<LoginPage />} />

      <Route path="/dashboard" element={<Workspace><DashboardPage /></Workspace>} />
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

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
