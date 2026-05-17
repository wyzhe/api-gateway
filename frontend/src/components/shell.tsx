import {
  Activity,
  BookOpen,
  CircleDollarSign,
  CpuIcon,
  Gauge,
  Image as ImageIcon,
  Key,
  LayoutGrid,
  LogOut,
  PlayCircle,
  Settings,
  Shield,
  Terminal,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

const WS_NAV = [
  { to: "/dashboard", label: "Dashboard", Icon: Gauge },
  { to: "/keys", label: "API Keys", Icon: Key },
  { to: "/logs", label: "Usage / Logs", Icon: Activity },
  { to: "/playground", label: "Playground", Icon: PlayCircle },
  { to: "/generations", label: "Generations", Icon: ImageIcon },
  { to: "/billing", label: "Billing", Icon: CircleDollarSign },
  { to: "/models", label: "Models", Icon: CpuIcon },
  { to: "/docs", label: "Docs", Icon: BookOpen },
];

const ADMIN_NAV = [
  { to: "/admin", label: "Overview", Icon: LayoutGrid },
  { to: "/admin/users", label: "Users", Icon: Users },
  { to: "/admin/models", label: "Models", Icon: CpuIcon },
  { to: "/admin/providers", label: "Providers", Icon: Settings },
  { to: "/admin/logs", label: "All Logs", Icon: Terminal },
];

export function Shell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const loc = useLocation();
  const isAdminArea = loc.pathname.startsWith("/admin");
  const nav = isAdminArea ? ADMIN_NAV : WS_NAV;

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r border-border bg-surface flex flex-col">
        <div className="p-4 border-b border-border">
          <Link to="/dashboard" className="flex items-center gap-2">
            <div
              className="h-6 w-6 rounded-md flex items-center justify-center"
              style={{ background: "var(--accent)" }}
            >
              <span
                className="text-[12px] font-bold"
                style={{ color: "var(--accent-foreground)" }}
              >
                R
              </span>
            </div>
            <span className="font-semibold text-sm">Relay</span>
            <span className="text-[10px] text-muted-foreground border border-border px-1.5 py-0.5 rounded mono">
              MVP
            </span>
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto p-2 flex flex-col gap-0.5">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1.5 mt-1">
            {isAdminArea ? "Admin" : "Workspace"}
          </div>
          {nav.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/admin"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 px-2 py-1.5 rounded-md text-sm",
                  isActive
                    ? "bg-surface-2 text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-surface-2",
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}

          {user?.role === "admin" && (
            <>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1.5 mt-4">
                Switch
              </div>
              <Link
                to={isAdminArea ? "/dashboard" : "/admin"}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-surface-2"
              >
                <Shield className="h-4 w-4" />
                {isAdminArea ? "Workspace" : "Admin"}
              </Link>
            </>
          )}
        </nav>

        <div className="border-t border-border p-3">
          <div className="text-xs text-foreground truncate">{user?.email}</div>
          <div className="text-[10px] text-muted-foreground capitalize">{user?.role}</div>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 w-full justify-start text-muted-foreground"
            onClick={logout}
          >
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </Button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <div className="px-6 py-6 max-w-[1600px] mx-auto">{children}</div>
      </main>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
