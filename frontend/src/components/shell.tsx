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
import { LanguageSwitcher } from "@/components/language-switcher";
import { useAuth } from "@/lib/auth";
import { useT, type TKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const WS_NAV: { to: string; key: TKey; Icon: typeof Gauge }[] = [
  { to: "/dashboard", key: "nav.dashboard", Icon: Gauge },
  { to: "/keys", key: "nav.apiKeys", Icon: Key },
  { to: "/logs", key: "nav.usageLogs", Icon: Activity },
  { to: "/playground", key: "nav.playground", Icon: PlayCircle },
  { to: "/generations", key: "nav.generations", Icon: ImageIcon },
  { to: "/billing", key: "nav.billing", Icon: CircleDollarSign },
  { to: "/models", key: "nav.models", Icon: CpuIcon },
  { to: "/docs", key: "nav.docs", Icon: BookOpen },
];

const ADMIN_NAV: { to: string; key: TKey; Icon: typeof Gauge }[] = [
  { to: "/admin", key: "nav.adminOverview", Icon: LayoutGrid },
  { to: "/admin/users", key: "nav.adminUsers", Icon: Users },
  { to: "/admin/models", key: "nav.adminModels", Icon: CpuIcon },
  { to: "/admin/providers", key: "nav.adminProviders", Icon: Settings },
  { to: "/admin/logs", key: "nav.adminLogs", Icon: Terminal },
];

export function Shell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const loc = useLocation();
  const t = useT();
  const isAdminArea = loc.pathname.startsWith("/admin");
  const nav = isAdminArea ? ADMIN_NAV : WS_NAV;

  return (
    <div className="flex h-screen overflow-hidden">
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
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto p-2 flex flex-col gap-0.5">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1.5 mt-1">
            {isAdminArea ? t("nav.sectionAdmin") : t("nav.sectionWorkspace")}
          </div>
          {nav.map(({ to, key, Icon }) => (
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
              {t(key)}
            </NavLink>
          ))}

          {user?.role === "admin" && (
            <>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1.5 mt-4">
                {t("nav.sectionSwitch")}
              </div>
              <Link
                to={isAdminArea ? "/dashboard" : "/admin"}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-surface-2"
              >
                <Shield className="h-4 w-4" />
                {isAdminArea ? t("nav.toWorkspace") : t("nav.toAdmin")}
              </Link>
            </>
          )}
        </nav>

        <div className="border-t border-border p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="min-w-0">
              <div className="text-xs text-foreground truncate">{user?.email}</div>
              <div className="text-[10px] text-muted-foreground capitalize">{user?.role}</div>
            </div>
            <LanguageSwitcher />
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-muted-foreground"
            onClick={logout}
          >
            <LogOut className="h-3.5 w-3.5" /> {t("nav.signOut")}
          </Button>
        </div>
      </aside>

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
