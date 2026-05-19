# Linear-style UI refresh — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the workspace + admin frontend from "developer console" uppercase-tracked styling to Linear-style lowercase 28px-baseline control sizing, dot-status presentation, popover-collapsed sidebar footer, and a slimmer PageHeader — without touching landing.tsx or login.tsx.

**Architecture:** Bottom-up. Update primitives (`ui/*`) first; composites and pages inherit. Add one new composite (`DotStatus`). Rewrite `DESIGN.md` once code lands so the source of truth is consistent.

**Tech Stack:** React 19 · TypeScript (strict) · Tailwind v4 · Radix UI · lucide-react · `class-variance-authority`. No new dependencies.

**Spec:** [docs/superpowers/specs/2026-05-19-linear-style-ui-refresh-design.md](../specs/2026-05-19-linear-style-ui-refresh-design.md)

**Commits** (4):
1. `refactor(ui): Linear-style sizes for primitives` — Tasks 1–10
2. `refactor(ui): composite components + DotStatus` — Tasks 11–18
3. `refactor(pages): adopt DotStatus and tight controls` — Tasks 19–24
4. `docs(design): rewrite DESIGN.md for Linear-style baseline` — Task 25

---

## Task 1: Button — new size variants

**Files:**
- Modify: `frontend/src/components/ui/button.tsx:22-27`

- [ ] **Step 1: Edit `size` cva variants**

Replace the `size:` block inside `buttonVariants`:

```tsx
      size: {
        default: "h-7 px-3 py-1",
        sm: "h-6 px-2.5 text-xs",
        lg: "h-9 px-5",
        icon: "h-7 w-7",
      },
```

Other variants and the base string stay as-is.

- [ ] **Step 2: Verify type-check**

```bash
cd frontend && npx tsc -b
```

Expected: no errors. (Type signature unchanged; only string content changed.)

---

## Task 2: Input — h-9 → h-7

**Files:**
- Modify: `frontend/src/components/ui/input.tsx:10`

- [ ] **Step 1: Edit className string**

Replace `flex h-9 w-full rounded-md` with `flex h-7 w-full rounded-md`. Keep all other classes.

- [ ] **Step 2: Verify type-check**

```bash
cd frontend && npx tsc -b
```

Expected: no errors.

---

## Task 3: Select — trigger + item

**Files:**
- Modify: `frontend/src/components/ui/select.tsx:17`, `:58`

- [ ] **Step 1: Edit SelectTrigger className**

In the SelectTrigger className string at line 17, replace `h-9 w-full` with `h-7 w-full`.

- [ ] **Step 2: Edit SelectItem className**

In SelectItem at line 58, replace `py-1.5 pl-8 pr-2` with `py-1 pl-8 pr-2`.

- [ ] **Step 3: Verify type-check**

```bash
cd frontend && npx tsc -b
```

Expected: no errors.

---

## Task 4: Textarea — keep height, tighten padding

Textarea is multi-line so we don't shrink `min-h-20`. We only ensure padding consistency.

**Files:**
- Modify: `frontend/src/components/ui/textarea.tsx:11`

- [ ] **Step 1: Edit className string**

No change required this pass — `flex min-h-20 ... px-3 py-2` already reads as Linear-style. Verify the existing class string contains `px-3 py-2`; leave the file unchanged.

- [ ] **Step 2: Verify type-check**

```bash
cd frontend && npx tsc -b
```

Expected: no errors.

---

## Task 5: Card — content/header/title

**Files:**
- Modify: `frontend/src/components/ui/card.tsx:18-30,39-43`

- [ ] **Step 1: Edit CardHeader**

Replace lines 18–23 with:

```tsx
export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col gap-1 px-3.5 py-2.5", className)} {...props} />
  ),
);
```

Removed: `border-b border-border`. Callers that need a divider can pass `className="border-b border-border"` explicitly.

- [ ] **Step 2: Edit CardTitle**

Replace lines 25–30 with:

```tsx
export const CardTitle = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref as any} className={cn("text-xs font-medium text-muted-foreground leading-none", className)} {...props} />
  ),
);
```

- [ ] **Step 3: Edit CardContent**

Replace lines 39–43 with:

```tsx
export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-3", className)} {...props} />
  ),
);
```

- [ ] **Step 4: Edit CardFooter**

Replace lines 46–50 (CardFooter) with:

```tsx
export const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("px-3.5 py-2.5 border-t border-border", className)} {...props} />
  ),
);
```

- [ ] **Step 5: Verify type-check**

```bash
cd frontend && npx tsc -b
```

Expected: no errors.

---

## Task 6: Badge — drop uppercase tracked, tighter padding

**Files:**
- Modify: `frontend/src/components/ui/badge.tsx:5-7`

- [ ] **Step 1: Edit base cva string**

Replace line 5–7 (the first argument to `cva`):

```tsx
const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2 py-0 text-[11px] font-medium whitespace-nowrap leading-5",
  {
```

Removed: `uppercase tracking-wider`. Lifted text from `text-[10px]` to `text-[11px]` because lowercase needs a hair more body. Added `leading-5` so the badge height stabilises at 20px without the previous padding-driven height.

- [ ] **Step 2: Verify type-check**

```bash
cd frontend && npx tsc -b
```

Expected: no errors.

---

## Task 7: Table — head + cell

**Files:**
- Modify: `frontend/src/components/ui/table.tsx:49-54,62-65`

- [ ] **Step 1: Edit TableHead className**

Replace the className string at lines 49–54 with:

```tsx
        "h-7 px-3 text-left align-middle font-medium text-muted-foreground text-xs [&:has([role=checkbox])]:pr-0",
```

Removed: `text-[11px] uppercase tracking-wider`. Replaced with `text-xs`. Height `h-9 → h-7`.

- [ ] **Step 2: Edit TableCell className**

Replace the className string at lines 62–65 with:

```tsx
      className={cn("px-3 py-1.5 align-middle [&:has([role=checkbox])]:pr-0", className)}
```

- [ ] **Step 3: Verify type-check**

```bash
cd frontend && npx tsc -b
```

Expected: no errors.

---

## Task 8: Tabs — h-9 → h-7

**Files:**
- Modify: `frontend/src/components/ui/tabs.tsx:14-17`

- [ ] **Step 1: Edit TabsList className**

Replace line 14–17 with:

```tsx
      "inline-flex h-7 items-center justify-center rounded-md bg-surface-2 p-0.5 text-muted-foreground border border-border",
```

- [ ] **Step 2: Edit TabsTrigger className**

Replace line 28–31 with:

```tsx
      "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-2.5 py-0.5 text-xs font-medium transition-all focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-surface data-[state=active]:text-foreground data-[state=active]:shadow",
```

Changed: `px-3 py-1 → px-2.5 py-0.5`. Same text size.

- [ ] **Step 3: Verify type-check**

```bash
cd frontend && npx tsc -b
```

Expected: no errors.

---

## Task 9: Dialog — p-6 → p-5, title text-base → text-sm

**Files:**
- Modify: `frontend/src/components/ui/dialog.tsx:40-43,76-80`

- [ ] **Step 1: Edit DialogContent className**

In the DialogContent className string (lines 40–43), replace `p-6` with `p-5`. Keep `gap-4` (still appropriate for 20px padding).

- [ ] **Step 2: Edit DialogTitle**

Replace lines 76–80 with:

```tsx
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-sm font-semibold leading-none", className)}
    {...props}
  />
```

Changed: `text-base → text-sm`.

- [ ] **Step 3: Verify type-check**

```bash
cd frontend && npx tsc -b
```

Expected: no errors.

---

## Task 10: Primitives checkpoint — build + commit

- [ ] **Step 1: Full build**

```bash
cd frontend && npm run build
```

Expected: `tsc -b` succeeds, `vite build` succeeds. No TS errors.

- [ ] **Step 2: Commit primitives**

```bash
cd /Users/guzhe/Desktop/vibe-coding-app/api-gateway/llm-api-gateway/.claude/worktrees/elegant-lamarr-32a075
git add frontend/src/components/ui/button.tsx frontend/src/components/ui/input.tsx frontend/src/components/ui/select.tsx frontend/src/components/ui/textarea.tsx frontend/src/components/ui/card.tsx frontend/src/components/ui/badge.tsx frontend/src/components/ui/table.tsx frontend/src/components/ui/tabs.tsx frontend/src/components/ui/dialog.tsx
git commit -m "$(cat <<'EOF'
refactor(ui): Linear-style sizes for primitives

Drops the 36px control rhythm and uppercase-tracked label-caps in favor
of the Linear-style 28px control rhythm and lowercase labels described
in docs/superpowers/specs/2026-05-19-linear-style-ui-refresh-design.md.

Button default h-9 -> h-7; sm h-8 -> h-6; lg h-10 -> h-9. Input/Select
trigger h-9 -> h-7. Tabs list h-9 -> h-7. TableHead loses uppercase
tracked, h-9 -> h-7, text-[11px] -> text-xs. TableCell py-2 -> py-1.5.
CardHeader loses default border-b and shrinks padding. CardContent
p-4 -> p-3. CardTitle becomes the muted text-xs section-label feel.
Badge drops uppercase tracked, text-[10px] -> text-[11px], py-0 with
leading-5 for a stable 20px pill. Dialog p-6 -> p-5; DialogTitle
text-base -> text-sm.

Landing and login pages opt out via their existing explicit className
overrides; no regression expected there.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: commit succeeds.

---

## Task 11: New DotStatus composite

**Files:**
- Create: `frontend/src/components/dot-status.tsx`

- [ ] **Step 1: Write the file**

```tsx
import { cn } from "@/lib/utils";

const STATUS_COLOR: Record<string, string> = {
  success: "bg-success",
  failed: "bg-destructive",
  queued: "bg-info",
  running: "bg-warn",
  pending: "bg-info",
  cancelled: "bg-dim",
};

const STATUS_FALLBACK = "bg-muted-foreground";

export function DotStatus({
  status,
  label,
  className,
}: {
  /** The raw status key from request/task; lowercase form. */
  status: string | null | undefined;
  /** The localized label (already translated by caller). */
  label: string;
  className?: string;
}) {
  const key = (status || "").toLowerCase();
  const color = STATUS_COLOR[key] || STATUS_FALLBACK;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs text-foreground whitespace-nowrap",
        className,
      )}
    >
      <span className={cn("inline-block h-1.5 w-1.5 rounded-full", color)} />
      {label}
    </span>
  );
}
```

Color map matches `statusBadgeVariant` in `frontend/src/lib/utils.ts` (success/warn/danger/info). Callers pass the already-translated label so this component stays free of i18n coupling.

- [ ] **Step 2: Verify type-check**

```bash
cd frontend && npx tsc -b
```

Expected: no errors. (No callers yet — added in later tasks.)

---

## Task 12: KpiTile — smaller padding, smaller value, normal-case label

**Files:**
- Modify: `frontend/src/components/kpi-tile.tsx:15-21`

- [ ] **Step 1: Replace the component body**

Replace lines 15–21 (the entire return inside `KpiTile`) with:

```tsx
  return (
    <div className={cn("rounded-md border border-border bg-card p-3 flex flex-col gap-1", className)}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold mono leading-tight">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
```

Changes: `p-4 → p-3`, `gap-1.5 → gap-1`, label drops `text-[10px] uppercase tracking-wider font-medium` for `text-xs text-muted-foreground`, value `text-2xl → text-lg` plus `leading-tight` to keep the row from inflating.

- [ ] **Step 2: Verify type-check**

```bash
cd frontend && npx tsc -b
```

Expected: no errors.

---

## Task 13: TypeBadge — keep uppercase abbreviations but shrink the pill

**Files:**
- Modify: `frontend/src/components/type-badge.tsx:25-34`

- [ ] **Step 1: Replace the className + icon size**

Replace the return JSX (lines 24–35) with:

```tsx
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border px-1 py-0 text-[9px] uppercase tracking-wider font-medium leading-4",
        m.cls,
        className,
      )}
    >
      <I className="h-2.5 w-2.5" />
      {m.label}
    </span>
  );
```

Changes: `gap-1 → gap-0.5`, `px-1.5 py-0.5 → px-1 py-0`, `text-[10px] → text-[9px]`, added `leading-4` for a stable 16px height, icon `h-3 w-3 → h-2.5 w-2.5`.

- [ ] **Step 2: Verify type-check**

```bash
cd frontend && npx tsc -b
```

Expected: no errors.

---

## Task 14: ProviderTag — no change required

ProviderTag is already a tiny inline (`text-xs text-muted-foreground` + 8px dot). It reads correctly against the new baseline. **No edit.**

- [ ] **Step 1: Verify the file already reads as intended**

```bash
cd /Users/guzhe/Desktop/vibe-coding-app/api-gateway/llm-api-gateway/.claude/worktrees/elegant-lamarr-32a075
grep -n 'text-xs text-muted-foreground' frontend/src/components/provider-tag.tsx
```

Expected: one match at line 34.

---

## Task 15: Shell — sidebar header + section labels + nav item heights

**Files:**
- Modify: `frontend/src/components/shell.tsx:56-86`

- [ ] **Step 1: Edit sidebar header (around lines 57-62)**

Replace:

```tsx
        <div className="p-4 border-b border-border">
          <Link to="/" className="flex items-center gap-2" title={t("nav.toLanding")}>
            <BrandMark />
            <span className="font-semibold text-sm">Relay</span>
          </Link>
        </div>
```

With:

```tsx
        <div className="px-3 py-2.5">
          <Link to="/" className="flex items-center gap-2" title={t("nav.toLanding")}>
            <BrandMark />
            <span className="font-semibold text-sm">Relay</span>
          </Link>
        </div>
```

Removed: `border-b border-border`. Shrunk: `p-4 → px-3 py-2.5`.

- [ ] **Step 2: Edit the WORKSPACE/ADMIN section heading (line 65-67)**

Replace:

```tsx
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1.5 mt-1">
            {isAdminArea ? t("nav.sectionAdmin") : t("nav.sectionWorkspace")}
          </div>
```

With:

```tsx
          <div className="text-[11px] text-muted-foreground px-2 py-1.5 mt-1">
            {isAdminArea ? t("nav.sectionAdmin") : t("nav.sectionWorkspace")}
          </div>
```

Removed: `text-[10px] uppercase tracking-wider`. Replaced with `text-[11px]`.

- [ ] **Step 3: Edit nav item baseline (lines 75-79)**

Replace:

```tsx
                cn(
                  "flex items-center gap-2 px-2 py-1.5 rounded-md text-sm",
                  isActive
                    ? "bg-surface-2 text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-surface-2",
                )
```

With:

```tsx
                cn(
                  "flex items-center gap-2 px-2 py-1 rounded-md text-[13px]",
                  isActive
                    ? "bg-surface-2 text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-surface-2",
                )
```

Changed: `py-1.5 → py-1`, `text-sm → text-[13px]`.

- [ ] **Step 4: Edit nav item icon size (line 82)**

Change `<Icon className="h-4 w-4" />` to `<Icon className="h-3.5 w-3.5" />`.

- [ ] **Step 5: Edit the second section heading (line 89-91)**

Replace:

```tsx
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1.5 mt-4">
                {t("nav.sectionSwitch")}
              </div>
```

With:

```tsx
              <div className="text-[11px] text-muted-foreground px-2 py-1.5 mt-4">
                {t("nav.sectionSwitch")}
              </div>
```

- [ ] **Step 6: Edit the "Switch to workspace" link (lines 92-98)**

Replace:

```tsx
              <Link
                to="/dashboard"
                className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-surface-2"
              >
                <Shield className="h-4 w-4" />
                {t("nav.toWorkspace")}
              </Link>
```

With:

```tsx
              <Link
                to="/dashboard"
                className="flex items-center gap-2 px-2 py-1 rounded-md text-[13px] text-muted-foreground hover:text-foreground hover:bg-surface-2"
              >
                <Shield className="h-3.5 w-3.5" />
                {t("nav.toWorkspace")}
              </Link>
```

- [ ] **Step 7: Verify type-check**

```bash
cd frontend && npx tsc -b
```

Expected: no errors.

---

## Task 16: Shell — sidebar footer collapses to popover

This task introduces Radix Popover for the user menu. Radix is already in the project.

**Files:**
- Verify dep: `frontend/package.json` (check `@radix-ui/react-popover` is installed)
- Create: `frontend/src/components/ui/popover.tsx` (only if it doesn't exist)
- Modify: `frontend/src/components/shell.tsx:103-138`

- [ ] **Step 1: Check Popover dep**

```bash
cd /Users/guzhe/Desktop/vibe-coding-app/api-gateway/llm-api-gateway/.claude/worktrees/elegant-lamarr-32a075
grep -n '@radix-ui/react-popover' frontend/package.json
```

If no match: install it.

```bash
cd frontend && npm install @radix-ui/react-popover
```

Expected: package added with no peer warnings.

- [ ] **Step 2: Create Popover primitive (skip if already exists)**

```bash
cd /Users/guzhe/Desktop/vibe-coding-app/api-gateway/llm-api-gateway/.claude/worktrees/elegant-lamarr-32a075
test -f frontend/src/components/ui/popover.tsx && echo EXISTS || echo MISSING
```

If `MISSING`, create the file with this content:

```tsx
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";
import { cn } from "@/lib/utils";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;

export const PopoverContent = forwardRef<
  ElementRef<typeof PopoverPrimitive.Content>,
  ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "center", sideOffset = 4, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        "z-50 w-56 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        className,
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;
```

- [ ] **Step 3: Replace the shell footer**

Replace lines 103–138 in `shell.tsx` (the entire `<div className="border-t border-border">…</div>` block at the bottom of the `<aside>`) with:

```tsx
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
```

- [ ] **Step 4: Add imports at the top of `shell.tsx`**

Add `Popover, PopoverContent, PopoverTrigger` from the new primitive:

```tsx
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
```

Add this line in the block of existing imports near `Button`/`BrandMark`/`LanguageSwitcher`. The `Button` import can stay; it's still used elsewhere in the shell (PageHeader actions, if any in callers). The duplicate `nav.toWorkspace` link block previously at lines 87–100 should also be removed in Step 5 below — it's superseded by the popover.

- [ ] **Step 5: Remove the in-nav switch-to-workspace block (now in popover)**

Delete lines 87–100 (inclusive of the `{user?.role === "admin" && isAdminArea && (` block that renders the "Switch to workspace" link inside `<nav>`). That control is now in the popover (Step 3).

After deletion, the `<nav>` should end with `</NavLink>` and the closing `)}` of the `.map`.

- [ ] **Step 6: Add the `nav.userMenu` / `nav.language` i18n keys**

```bash
cd /Users/guzhe/Desktop/vibe-coding-app/api-gateway/llm-api-gateway/.claude/worktrees/elegant-lamarr-32a075
grep -n '"nav"' frontend/src/lib/i18n/dict-en.ts | head -3
```

Then edit `frontend/src/lib/i18n/dict-en.ts` adding, inside the `nav: { ... }` block:

```ts
    userMenu: "User menu",
    language: "Language",
```

And matching entries in `frontend/src/lib/i18n/dict-zh.ts`:

```ts
    userMenu: "用户菜单",
    language: "语言",
```

- [ ] **Step 7: Verify type-check**

```bash
cd frontend && npx tsc -b
```

Expected: no errors. If `EnDict`/`TKey` complains about missing keys in zh, the grep in Step 6 missed them — re-check both dict files.

---

## Task 17: Shell — PageHeader smaller title + margin

**Files:**
- Modify: `frontend/src/components/shell.tsx:148-166`

- [ ] **Step 1: Edit PageHeader**

Replace the `PageHeader` function body:

```tsx
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
```

Changes: `mb-6 → mb-4`, `text-xl → text-base`, subtitle `text-sm → text-xs`.

- [ ] **Step 2: Verify type-check**

```bash
cd frontend && npx tsc -b
```

Expected: no errors.

---

## Task 18: Composites checkpoint — build + commit

- [ ] **Step 1: Full build**

```bash
cd frontend && npm run build
```

Expected: success.

- [ ] **Step 2: Commit composites**

```bash
cd /Users/guzhe/Desktop/vibe-coding-app/api-gateway/llm-api-gateway/.claude/worktrees/elegant-lamarr-32a075
git add frontend/src/components/dot-status.tsx frontend/src/components/kpi-tile.tsx frontend/src/components/type-badge.tsx frontend/src/components/shell.tsx frontend/src/components/ui/popover.tsx frontend/src/lib/i18n/dict-en.ts frontend/src/lib/i18n/dict-zh.ts frontend/package.json frontend/package-lock.json 2>/dev/null
git commit -m "$(cat <<'EOF'
refactor(ui): composites adopt new size baseline + add DotStatus

KpiTile: p-4 -> p-3, value text-2xl -> text-lg, label drops uppercase
tracked. TypeBadge: smaller pill (px-1 py-0 text-[9px] leading-4) but
keeps the 3-letter uppercase abbreviation. Shell sidebar tightens header,
section labels, nav items; the stuffed footer collapses behind a Radix
popover triggered by avatar+name. PageHeader text-xl -> text-base, mb-6
-> mb-4. New DotStatus composite replaces the status Badge in feeds and
tables (callers updated in next commit).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: commit succeeds.

---

## Task 19: Dashboard — DotStatus + merge StatList

**Files:**
- Modify: `frontend/src/pages/dashboard.tsx`

- [ ] **Step 1: Swap imports**

Change line 5 from `import { Badge } from "@/components/ui/badge";` to:

```tsx
import { DotStatus } from "@/components/dot-status";
```

(Badge is no longer used in this file; remove the import.)

- [ ] **Step 2: Replace the Badge in the activity row (line 97)**

Replace `<Badge variant={statusBadgeVariant(r.status)}>{t(reqStatusKey(r.status))}</Badge>` with:

```tsx
<DotStatus status={r.status} label={t(reqStatusKey(r.status))} />
```

Also remove the now-unused `statusBadgeVariant` from the import on line 11. Re-check that `statusBadgeVariant` is no longer referenced anywhere in this file:

```bash
cd /Users/guzhe/Desktop/vibe-coding-app/api-gateway/llm-api-gateway/.claude/worktrees/elegant-lamarr-32a075
grep -n 'statusBadgeVariant' frontend/src/pages/dashboard.tsx
```

If only the import line shows up, edit line 11 from `import { fmtBalance, fmtCompactMoney, fmtRelative, reqStatusKey, statusBadgeVariant } from "@/lib/utils";` to `import { fmtBalance, fmtCompactMoney, fmtRelative, reqStatusKey } from "@/lib/utils";`.

- [ ] **Step 3: Merge the two StatList cards into one Card**

Replace lines 107–127 (the `<div className="flex flex-col gap-4">` block containing two `<StatList />`) with:

```tsx
        <Card>
          <CardHeader><CardTitle>{t("dashboard.topModels")}</CardTitle></CardHeader>
          <CardContent className="p-0">
            <StatRows
              empty={t("dashboard.noDataYet")}
              items={data?.top_models_by_cost ?? []}
              getKey={(m) => m.model_id ?? -1}
              getLabel={(m) => m.model_name || "—"}
              getValue={(m) => t("dashboard.statValueCostRequests", { cost: fmtCompactMoney(m.cost), requests: m.requests })}
              onClick={(m) => m.model_name && nav(`/logs?model=${encodeURIComponent(m.model_name)}`)}
            />
          </CardContent>
          <CardHeader className="border-t border-border"><CardTitle>{t("dashboard.topApiKeys")}</CardTitle></CardHeader>
          <CardContent className="p-0">
            <StatRows
              empty={t("dashboard.noDataYet")}
              items={data?.top_api_keys_by_usage ?? []}
              getKey={(k) => k.api_key_id ?? -1}
              getLabel={(k) => k.api_key_prefix ? `${k.api_key_prefix}…` : t("dashboard.deletedKey")}
              getValue={(k) => t("dashboard.statValueRequestsCost", { requests: k.requests, cost: fmtCompactMoney(k.cost) })}
              onClick={(k) => k.api_key_id && nav(`/logs?api_key_id=${k.api_key_id}`)}
            />
          </CardContent>
        </Card>
```

- [ ] **Step 4: Replace the `StatList` helper with a `StatRows` helper**

Replace the entire `StatList` function (lines 134–168) with:

```tsx
function StatRows<T>({
  empty, items, getKey, getLabel, getValue, onClick,
}: {
  empty: string;
  items: T[];
  getKey: (it: T) => number | string;
  getLabel: (it: T) => string;
  getValue: (it: T) => string;
  onClick: (it: T) => void;
}) {
  if (items.length === 0) {
    return <div className="p-3 text-xs text-muted-foreground">{empty}</div>;
  }
  return (
    <ul className="divide-y divide-border">
      {items.map((it) => (
        <li
          key={getKey(it)}
          onClick={() => onClick(it)}
          className="px-3.5 py-1.5 flex items-center justify-between text-xs cursor-pointer hover:bg-surface-2"
        >
          <span className="mono">{getLabel(it)}</span>
          <span className="text-muted-foreground">{getValue(it)}</span>
        </li>
      ))}
    </ul>
  );
}
```

The new helper drops the inner `<Card>` wrapper (the parent Card already provides it) and tightens row paddings to match the new CardHeader rhythm.

- [ ] **Step 5: Verify type-check**

```bash
cd frontend && npx tsc -b
```

Expected: no errors.

---

## Task 20: Usage Logs — sm controls + DotStatus

**Files:**
- Modify: `frontend/src/pages/usage-logs.tsx`

- [ ] **Step 1: Swap imports**

Remove `Badge` from the import block at line 3, replace with:

```tsx
import { DotStatus } from "@/components/dot-status";
```

Update line 20 from `import { fmtCompactMoney, fmtRelative, reqStatusKey, statusBadgeVariant } from "@/lib/utils";` to `import { fmtCompactMoney, fmtRelative, reqStatusKey } from "@/lib/utils";`.

- [ ] **Step 2: Add `size="sm"` semantics via classNames on the filter row**

In the filter row (lines 50–77), the Selects and Input are already `h-7` by default after Task 2/3. The widths stay (`w-32`, `w-36`, `w-56`). The Refresh button needs `size="sm"`:

Change `<Button variant="outline" onClick={() => refresh()}>{t("usageLogs.refreshBtn")}</Button>` to:

```tsx
<Button variant="outline" size="sm" onClick={() => refresh()}>{t("usageLogs.refreshBtn")}</Button>
```

- [ ] **Step 3: Replace the status cell with DotStatus + outline badge for task-status delta**

Replace the `<TableCell>` block at lines 109–114 with:

```tsx
                <TableCell>
                  <DotStatus status={r.status} label={t(reqStatusKey(r.status))} />
                  {r.task_status && r.task_status !== r.status && (
                    <DotStatus
                      status={r.task_status}
                      label={t(reqStatusKey(r.task_status))}
                      className="ml-2 opacity-70"
                    />
                  )}
                </TableCell>
```

The "ml-2 opacity-70" treatment makes the second dot read as "after-state / qualifier" rather than the primary status.

- [ ] **Step 4: Verify type-check**

```bash
cd frontend && npx tsc -b
```

Expected: no errors.

---

## Task 21: API Keys — hover-revealed row actions

**Files:**
- Modify: `frontend/src/pages/api-keys.tsx`

- [ ] **Step 1: Refactor the row-actions cell (lines 249–261)**

Replace:

```tsx
                  <TableCell className="text-right">
                    <div className="inline-flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(k)} title={t("apiKeys.editTitle")}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => onToggle(k)}>
                        {k.status === "active" ? t("apiKeys.disable") : t("apiKeys.enable")}
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => onDelete(k)} title={t("apiKeys.deleteTitle")}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
```

With (a single group of 3 icon-only buttons + a tiny Disable/Enable toggle, opacity-50 at rest):

```tsx
                  <TableCell className="text-right">
                    <div className="inline-flex gap-0.5 opacity-50 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[11px]"
                        onClick={() => onToggle(k)}
                        title={k.status === "active" ? t("apiKeys.disable") : t("apiKeys.enable")}
                      >
                        {k.status === "active" ? t("apiKeys.disable") : t("apiKeys.enable")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => openEdit(k)}
                        title={t("apiKeys.editTitle")}
                        aria-label={t("apiKeys.editTitle")}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => onDelete(k)}
                        title={t("apiKeys.deleteTitle")}
                        aria-label={t("apiKeys.deleteTitle")}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
```

- [ ] **Step 2: Add `group` to the TableRow so `group-hover:opacity-100` works**

Find the `<TableRow key={k.id}>` around line 206 and update to:

```tsx
                <TableRow key={k.id} className="group">
```

- [ ] **Step 3: Verify type-check**

```bash
cd frontend && npx tsc -b
```

Expected: no errors.

---

## Task 22: Generations — Badge → DotStatus + smaller text in card body

**Files:**
- Modify: `frontend/src/pages/generations.tsx`

- [ ] **Step 1: Swap imports**

Remove `Badge` from the import block (line 2), replace with:

```tsx
import { DotStatus } from "@/components/dot-status";
```

- [ ] **Step 2: Replace the Badge in the pending-failed list (lines 103–105)**

Replace:

```tsx
                  <Badge variant={it.status === "failed" ? "danger" : "info"}>
                    {t(reqStatusKey(it.task_status || it.status))}
                  </Badge>
```

With:

```tsx
                  <DotStatus
                    status={it.task_status || it.status}
                    label={t(reqStatusKey(it.task_status || it.status))}
                  />
```

- [ ] **Step 3: Verify type-check**

```bash
cd frontend && npx tsc -b
```

Expected: no errors.

---

## Task 23: LogDetailDrawer — drop label-caps, swap Badge for DotStatus in header

**Files:**
- Modify: `frontend/src/components/log-detail-drawer.tsx`

- [ ] **Step 1: Swap imports**

Remove `Badge` from line 3, add `DotStatus`:

```tsx
import { DotStatus } from "@/components/dot-status";
```

Update line 17 from `import { fmtCompactMoney, fmtDate, reqStatusKey, statusBadgeVariant } from "@/lib/utils";` to `import { fmtCompactMoney, fmtDate, reqStatusKey } from "@/lib/utils";`.

- [ ] **Step 2: Replace the status Badge in the SheetTitle (line 48)**

Replace `<Badge variant={statusBadgeVariant(log.status)}>{t(reqStatusKey(log.status))}</Badge>` with:

```tsx
<DotStatus status={log.status} label={t(reqStatusKey(log.status))} />
```

- [ ] **Step 3: Replace the three `text-[10px] uppercase tracking-wider` section labels**

Around lines 95, 124, 134 there are three `<div className="text-[10px] uppercase tracking-wider text-muted-foreground …">` headings (asset / request / response sections). Replace each occurrence of `text-[10px] uppercase tracking-wider text-muted-foreground` with `text-[11px] text-muted-foreground`. Use Edit's `replace_all` if needed:

```bash
# (illustrative; do via Edit tool with replace_all)
# from: text-[10px] uppercase tracking-wider text-muted-foreground
# to:   text-[11px] text-muted-foreground
```

- [ ] **Step 4: Verify type-check**

```bash
cd frontend && npx tsc -b
```

Expected: no errors.

---

## Task 24: Pages checkpoint — full build + smoke test + commit

- [ ] **Step 1: Full build**

```bash
cd frontend && npm run build
```

Expected: success.

- [ ] **Step 2: Audit for any remaining uppercase-tracked label-caps callers in workspace pages**

```bash
cd /Users/guzhe/Desktop/vibe-coding-app/api-gateway/llm-api-gateway/.claude/worktrees/elegant-lamarr-32a075
grep -rn 'uppercase tracking-wider' frontend/src/ --include='*.tsx' --include='*.ts' | grep -v 'pages/landing.tsx' | grep -v 'pages/login.tsx' | grep -v 'type-badge.tsx'
```

Expected: at most a handful of intentional matches (landing/login eyebrows are filtered; type-badge intentionally keeps uppercase). If matches in workspace pages remain, replace `uppercase tracking-wider` with nothing (just remove those classes) and re-build.

- [ ] **Step 3: Commit pages**

```bash
git add frontend/src/pages/dashboard.tsx frontend/src/pages/usage-logs.tsx frontend/src/pages/api-keys.tsx frontend/src/pages/generations.tsx frontend/src/components/log-detail-drawer.tsx
# add any extra files surfaced by the audit in Step 2:
git add -u frontend/src/
git commit -m "$(cat <<'EOF'
refactor(pages): adopt DotStatus and tight Linear-style controls

Dashboard, Usage Logs, Generations, and the shared LogDetailDrawer now
render request/task status via the new DotStatus composite. Dashboard
merges Top Models + Top API Keys into one Card with two sections.
Usage Logs gets size="sm" Refresh and a dimmed secondary DotStatus
when task_status differs from status. API Keys row actions become a
hover-revealed icon group (opacity-50 at rest, opacity-100 on row
hover). Drops the few remaining text-[10px] uppercase tracking-wider
label-caps in workspace pages; landing/login eyebrows are unaffected.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: commit succeeds.

---

## Task 25: DESIGN.md rewrite

**Files:**
- Modify: `DESIGN.md`

`DESIGN.md` is the source of truth (per `CLAUDE.md`). The code is now Linear-style; the doc must agree.

- [ ] **Step 1: Update the `typography:` frontmatter block (lines 34-73)**

Remove the `label-caps` and `label-caps-xs` entries. Update `page-title` font-size from `1.25rem` to `1rem` (matches new `text-base`). Update `section-title` from `0.875rem` to `0.75rem` (matches new `text-xs`).

- [ ] **Step 2: Update the `components:` frontmatter block (lines 88-167)**

- `button-primary`, `button-outline`, `button-ghost`, `button-destructive`: change `height: 36px` to `height: 28px`, `padding: "0 16px"` to `padding: "0 12px"`.
- `input`: same — `height: 28px`, `padding: "0 12px"`.
- `card`: change `padding: 16px` to `padding: 12px`.
- `tabs-list`: `height: 28px`, `padding: 2px`.
- `table-head`: `height: 28px`, `padding: "0 12px"`.

- [ ] **Step 3: Update §Typography prose (around line 246)**

Remove the `label-caps` and `label-caps-xs` rows from the size scale table. Add a one-line note: "Label rows (table headers, KPI labels) use `text-xs text-muted-foreground` — no uppercase, no tracking. This is a deliberate Linear-style break from the older `label-caps` pattern."

- [ ] **Step 4: Update §Layout density rules (around line 296)**

Replace "Tables = `h-9` head row (36px), `px-3 py-2` cells" with "Tables = `h-7` head row (28px), `px-3 py-1.5` cells. Sticky header is not used."

- [ ] **Step 5: Update §Components primary table (around line 364)**

For each row, update height/padding to match the new primitives:

- Button: `h-7 default, h-6 sm, h-9 lg`
- Input/Textarea/Select: `h-7`
- Tabs: `h-7 list`
- Table: row `h-7 head`, `py-1.5 cell`
- Card: `p-3 default`
- Dialog: `p-5`
- Add a new row: `DotStatus` — `frontend/src/components/dot-status.tsx` — "Status presentation for request/task lifecycle. 6px colored dot + lowercase label. Replaces `Badge` for ephemeral state in tables and feeds."

- [ ] **Step 6: Add a new §`DotStatus vs Badge` rule (right before §Do's and Don'ts)**

```markdown
### When to use DotStatus vs Badge

- **`<DotStatus status="success" label="…" />`** — request/task lifecycle (success, failed, queued, running, cancelled). Anything that changes through the life of an item.
- **`<Badge variant="success">…</Badge>`** — durable category or state labels (API key `active`/`disabled`/`revoked`, transaction `credit`/`debit`/`refund`, modality classification when not covered by `TypeBadge`).

If you find yourself reaching for `Badge` to display a request's success/failure inside a table or feed, switch to `DotStatus` — it carries the same information at half the visual weight.
```

- [ ] **Step 7: Update the §Do's and Don'ts table**

- Replace `Use mono for numbers...` row → unchanged.
- Replace the `Use <PageHeader title={...} />` row to mention the new `text-base` size:
  "Use `<PageHeader title={...} />` — title is `text-base font-semibold`, no subtitle, no description prose."
- Add a new "Do" row: "Use `<DotStatus />` for request/task status in tables and feeds." with the matching "Don't": "Use `<Badge>` for ephemeral request state — that's `DotStatus`'s job."
- Add a new "Do" row about hover-revealed table actions: "Row action icon groups in tables render `opacity-50` at rest and `opacity-100` on `group-hover` / focus." with "Don't": "Hide action icons completely behind hover — discoverability suffers; opacity-50 keeps them visible while quieter."

- [ ] **Step 8: Update §Overview (lines 170-194)**

Edit the second paragraph to reflect the size shift. Replace any mention of "36px control" with "28px control"; replace any mention of "uppercase tracked label-caps" with reference to muted lowercase labels.

- [ ] **Step 9: Verify the doc still reads as a coherent style guide**

Re-read the whole file end-to-end. Fix any internal contradictions you find.

- [ ] **Step 10: Commit**

```bash
git add DESIGN.md
git commit -m "$(cat <<'EOF'
docs(design): rewrite DESIGN.md for Linear-style baseline

The code is now Linear-style (28px control rhythm, lowercase labels,
DotStatus for ephemeral status). This commit rewrites DESIGN.md so the
"source of truth" (per CLAUDE.md) matches what shipped:

- Typography size scale drops label-caps / label-caps-xs.
- Page title text-xl -> text-base.
- Section title text-sm -> text-xs.
- Component dimensions in the frontmatter and §Components table reflect
  the new h-7 baseline.
- Tables row "h-9 head, py-2 cell" -> "h-7 head, py-1.5 cell".
- New §DotStatus vs Badge rule.
- Do's and Don'ts updated for DotStatus and hover-revealed row actions.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: commit succeeds.

---

## Self-review (already completed by author)

**Spec coverage:** every primitive in spec §6 has a task; every page in spec §7 has a task; the DotStatus pattern (§5.1), sidebar popover (§5.2), PageHeader (§5.3), filter sm controls (§5.4), and hover-revealed actions (§5.5) each have a dedicated task. DESIGN.md rewrite (§8) is Task 25.

**Placeholders:** none. Every step contains either an exact replacement string, an exact command, or an explicit "no edit needed" note.

**Type consistency:** `DotStatus({ status, label })` is the signature used by Tasks 11/19/20/22/23. `StatRows` is internal to dashboard.tsx only. Popover/PopoverContent/PopoverTrigger names match the new primitive.

**Scope check:** the four commit boundaries (Tasks 10/18/24/25) match the spec's PR sequencing. Each commit independently buildable.
