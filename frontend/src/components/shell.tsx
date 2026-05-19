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
import { BrandMark } from "@/components/brand-mark";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  { to: "/settings/connections", key: "nav.settingsConnections", Icon: Shield },
  { to: "/settings/security", key: "nav.settingsSecurity", Icon: Settings },
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
        <div className="px-3 py-2.5">
          <Link to="/" className="flex items-center gap-2" title={t("nav.toLanding")}>
            <BrandMark />
            <span className="font-semibold text-sm">Relay</span>
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto p-2 flex flex-col gap-0.5">
          <div className="text-[11px] text-muted-foreground px-2 py-1.5 mt-1">
            {isAdminArea ? t("nav.sectionAdmin") : t("nav.sectionWorkspace")}
          </div>
          {nav.map(({ to, key, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/admin"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 px-2 py-1 rounded-md text-[13px]",
                  isActive
                    ? "bg-surface-2 text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-surface-2",
                )
              }
            >
              <Icon className="h-3.5 w-3.5" />
              {t(key)}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-border p-2">
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-surface-2 text-left"
                aria-label={t("nav.userMenu")}
              >
                <div className="h-6 w-6 shrink-0 rounded-md bg-gradient-to-br from-accent/35 to-surface-3 border border-border-strong flex items-center justify-center text-[11px] font-semibold text-foreground">
                  {user?.email?.[0]?.toUpperCase() ?? "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] text-foreground leading-tight truncate">
                    {user?.email?.split("@")[0]}
                  </div>
                </div>
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" align="start" className="w-56">
              <div className="px-2 py-1.5 text-[11px] text-muted-foreground mono truncate" title={user?.email}>
                {user?.email}
              </div>
              <div className="h-px bg-border my-1" />
              {user?.role === "admin" && !isAdminArea && (
                <Link
                  to="/admin"
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] text-foreground hover:bg-surface-2"
                >
                  <Shield className="h-3.5 w-3.5" /> {t("nav.toAdmin")}
                </Link>
              )}
              {user?.role === "admin" && isAdminArea && (
                <Link
                  to="/dashboard"
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] text-foreground hover:bg-surface-2"
                >
                  <Shield className="h-3.5 w-3.5" /> {t("nav.toWorkspace")}
                </Link>
              )}
              <div className="flex items-center justify-between px-2 py-1.5 text-[13px] text-muted-foreground">
                <span>{t("nav.language")}</span>
                <LanguageSwitcher compact />
              </div>
              <button
                type="button"
                onClick={logout}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] text-muted-foreground hover:text-foreground hover:bg-surface-2"
              >
                <LogOut className="h-3.5 w-3.5" /> {t("nav.signOut")}
              </button>
            </PopoverContent>
          </Popover>
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
    <div className="flex items-start justify-between mb-4">
      <div>
        <h1 className="text-base font-semibold">{title}</h1>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
