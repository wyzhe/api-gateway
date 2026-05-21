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
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip } from "@/components/ui/tooltip";
import { useAuth } from "@/lib/auth";
import { useT, type TKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type NavItem = { to: string; key: TKey; Icon: typeof Gauge };
type NavGroup = { labelKey: TKey; items: NavItem[] };

const WS_GROUPS: NavGroup[] = [
  {
    labelKey: "nav.groupWorkspace",
    items: [
      { to: "/dashboard", key: "nav.dashboard", Icon: Gauge },
      { to: "/keys", key: "nav.apiKeys", Icon: Key },
      { to: "/logs", key: "nav.usageLogs", Icon: Activity },
      { to: "/playground", key: "nav.playground", Icon: PlayCircle },
      { to: "/generations", key: "nav.generations", Icon: ImageIcon },
    ],
  },
  {
    labelKey: "nav.groupAccount",
    items: [
      { to: "/billing", key: "nav.billing", Icon: CircleDollarSign },
    ],
  },
  {
    labelKey: "nav.groupReference",
    items: [
      { to: "/models", key: "nav.models", Icon: CpuIcon },
      { to: "/docs", key: "nav.docs", Icon: BookOpen },
    ],
  },
];

const ADMIN_GROUPS: NavGroup[] = [
  {
    labelKey: "nav.sectionAdmin",
    items: [
      { to: "/admin", key: "nav.adminOverview", Icon: LayoutGrid },
      { to: "/admin/users", key: "nav.adminUsers", Icon: Users },
      { to: "/admin/models", key: "nav.adminModels", Icon: CpuIcon },
      { to: "/admin/providers", key: "nav.adminProviders", Icon: Settings },
      { to: "/admin/logs", key: "nav.adminLogs", Icon: Terminal },
    ],
  },
];

export function Shell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const loc = useLocation();
  const t = useT();
  const isAdminArea = loc.pathname.startsWith("/admin");

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-56 shrink-0 border-r border-border-strong bg-surface flex flex-col">
        <div className="px-3 py-2.5">
          <Tooltip content={t("nav.toLanding")}>
            <Link to="/" className="flex items-center gap-2">
              <BrandMark />
              <span className="font-semibold text-sm">Relay</span>
            </Link>
          </Tooltip>
        </div>

        <nav className="flex-1 overflow-y-auto p-2 flex flex-col gap-0.5">
          {(isAdminArea ? ADMIN_GROUPS : WS_GROUPS).map((group, gi) => (
            <div key={group.labelKey} className={gi === 0 ? "" : "mt-2"}>
              <NavGroupLabel>{t(group.labelKey)}</NavGroupLabel>
              <div className="flex flex-col gap-0.5">
                {group.items.map((item) => (
                  <NavItemLink key={item.to} item={item} />
                ))}
              </div>
            </div>
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
              <Tooltip content={user?.email}>
                <div className="px-2 py-1.5 text-[11px] text-muted-foreground mono truncate">
                  {user?.email}
                </div>
              </Tooltip>
              <div className="h-px bg-border my-1" />
              <Link
                to="/account"
                className="flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] text-foreground hover:bg-surface-2"
              >
                <Settings className="h-3.5 w-3.5" /> {t("nav.accountSettings")}
              </Link>
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
                <span>{t("nav.theme")}</span>
                <ThemeSwitcher />
              </div>
              <div className="flex items-center justify-between px-2 py-1.5 text-[13px] text-muted-foreground">
                <span>{t("nav.language")}</span>
                <LanguageSwitcher />
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

function NavGroupLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[11px] text-muted-foreground px-2 py-1">{children}</div>
  );
}

function NavItemLink({ item }: { item: NavItem }) {
  const t = useT();
  const { to, key, Icon } = item;
  return (
    <NavLink
      to={to}
      end={to === "/admin"}
      className={({ isActive }) =>
        cn(
          "relative flex items-center gap-2 px-2 py-1 rounded-md text-[13px]",
          isActive
            ? "bg-surface-2 text-foreground before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-0.5 before:bg-accent before:rounded-r-sm"
            : "text-foreground/70 hover:text-foreground hover:bg-surface-2",
        )
      }
    >
      <Icon className="h-3.5 w-3.5" />
      {t(key)}
    </NavLink>
  );
}

export function PageHeader({
  title,
  actions,
}: {
  title: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between pb-3 mb-4 border-b border-border">
      <h1 className="text-base font-semibold">{title}</h1>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
