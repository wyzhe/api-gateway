# Linear-style deep refresh — design

> Status: approved 2026-05-20. Scope: frontend only.
>
> Follow-up to `2026-05-19-linear-style-ui-refresh-design.md`. That spec
> retired uppercase tracking, introduced `DotStatus`, and tightened the
> sidebar/landing visual baseline. This spec pushes the workspace
> further toward a Linear / Vercel internal-tool feel by removing the
> remaining "card chrome" everywhere it adds visual weight without
> information, and closes a handful of code/DESIGN.md drift items in
> one pass.
>
> Out of scope (deliberately): Command palette, route-transition
> progress bar, list keyboard navigation, toast restyling, filter-bar
> chips, sidebar count badges, list-row leading 2px indicators.
> Decision recorded after brainstorming on 2026-05-20.

## Motivation

The current UI already reads as a developer console (dense tables,
mono numerics, no marketing prose). The remaining "non-Linear" feel
comes from three places:

1. **Visual nesting.** KPI tiles are bordered cards inside a page that
   already has a left sidebar — two frames around the same data. The
   Dashboard "Recent activity" panel is a Card inside the page,
   wrapped around a list that has its own divider — three frames.
2. **Sidebar flatness.** All 10 workspace nav items live in one
   undifferentiated list. There's no read-only-vs-actionable
   distinction, and the active item is just a tinted row.
3. **PageHeader floating.** The page title sits on a 16px-bottom-margin
   block with no horizontal rule, so any toolbar / action row hovers
   below it disconnected from the title.

We are also carrying a small accumulation of code/`DESIGN.md` drift
items that are cheaper to clean up in this PR than to schedule
separately.

## Out of scope (decided)

| Idea | Decision |
|:--|:--|
| List leading 2px status indicator bar | Rejected — visual noise on dense lists, dot already does the job. |
| Filter bar → ghost chips | Rejected — current boxed Selects are fine; chip popover infrastructure not worth it. |
| Sidebar count badges (active keys, recent failures) | Rejected — keeps sidebar quiet. |
| Command palette (Cmd+K) | Rejected for this iteration. |
| Route transition progress bar | Rejected for this iteration. |
| List keyboard nav (j/k/Enter) | Rejected for this iteration. |
| Toast restyle to DotStatus pair | Rejected for this iteration. |

These remain available for a future PR; they are not blocked by this
spec.

## Changes in scope

### 1. DESIGN.md

- **Typography table** — add `kpi-strip-value`: `1.375rem` (22px),
  `font-weight: 600`, `letter-spacing: -0.01em`. Replaces the old
  `text-lg` (18px) on KPI tiles in dashboard / admin overview /
  billing. The old `text-lg` row stays in the table but its "Used for"
  drops the KPI mention.
- **Layout § KPI grid** — rename to "KPI strip". New description:
  "Edge-to-edge horizontal strip. `grid-cols-2 md:grid-cols-4`,
  `border-b border-border` under the row, each cell `py-4 pr-5`,
  cells separated by `border-r border-border` (last cell drops it).
  Value uses the `kpi-strip-value` type. No outer card border."
- **Layout § PageHeader** — update: "Workspace/admin page header is
  `flex justify-between items-center pb-3 mb-4 border-b border-border`.
  Title `text-base font-semibold`. Right-side `actions` slot
  preserved. No subtitle (already retired)."
- **Components table** — add `KpiStrip` row, add `EmptyState` row.
- **Do/Don't table** — add: "Use `<EmptyState>` for any 'no data yet'
  table row, list, or panel" / "Hand-rolled `text-center
  text-muted-foreground py-8` blocks for empty state."
- **Mistakes-easy-to-make** — add a bullet noting that `shadow-sm` on
  inputs / `shadow-md` on popovers was a shadcn default that we
  explicitly removed; if a new primitive ships with one, strip it.

### 2. New components

#### `frontend/src/components/kpi-strip.tsx`

```tsx
type KpiStripItem = {
  label: ReactNode;
  value: ReactNode;       // usually `<span className="mono">…</span>`
  hint?: ReactNode;
  onClick?: () => void;   // optional: makes the cell a button
  title?: string;
};

export function KpiStrip({ items }: { items: KpiStripItem[] }) { … }
```

- Renders `grid-cols-2 md:grid-cols-4 border-b border-border mb-6`.
- Each cell `py-4 pr-5` (last cell `pr-0`), with `border-r
  border-border` between cells (`md:` only, single-column on mobile
  drops the right border).
- Label `text-xs text-muted-foreground`.
- Value `text-[1.375rem] font-semibold leading-tight mono` (we expose
  this as a utility, see below).
- Hint `text-xs text-muted-foreground mt-1`.
- If `onClick` is provided, the cell becomes a focusable `<button>`
  with `focus-visible:ring-2 focus-visible:ring-ring`.

We expose `kpi-strip-value` as a Tailwind utility via
`@layer components` in `index.css`:

```css
@layer components {
  .kpi-strip-value {
    font-size: 1.375rem;
    line-height: 1.1;
    font-weight: 600;
    letter-spacing: -0.01em;
  }
}
```

`KpiTile` is retained for now (used elsewhere in admin?) but flagged
deprecated; all in-repo callers move to `KpiStrip`. If after the
migration no caller remains, delete `KpiTile` in the same PR.

#### `frontend/src/components/empty-state.tsx`

```tsx
type EmptyStateProps = {
  icon?: ReactNode;       // lucide icon — optional; e.g. Inbox, Activity
  title: ReactNode;       // primary line
  hint?: ReactNode;       // optional secondary line
  action?: ReactNode;     // optional CTA (Button or Link)
  className?: string;
};
export function EmptyState({ … }: EmptyStateProps) { … }
```

- Default layout `py-10 px-4 flex flex-col items-center gap-2
  text-center`.
- `icon` slot renders at `h-6 w-6 text-faint mb-1`.
- `title` is `text-sm text-muted-foreground`.
- `hint` is `text-xs text-faint`.
- `action` rendered below hint with `mt-2`.
- Works both inside a `<TableCell colSpan={…}>` and inside a panel.

### 3. Primitive shadow cleanup

| File | Change |
|:--|:--|
| `frontend/src/components/ui/input.tsx` | Drop `shadow-sm`. |
| `frontend/src/components/ui/textarea.tsx` | Drop `shadow-sm`. |
| `frontend/src/components/ui/popover.tsx` | Drop `shadow-md`. |
| `frontend/src/components/ui/select.tsx` | Drop `shadow-md` from content. |

No replacement border or background — the existing `border border-border`
already provides sufficient separation against `bg-input` /
`bg-popover`.

Dialog (`shadow-lg`) and Switch thumb (`shadow-lg`) remain unchanged —
both are explicitly allowed in `DESIGN.md § Elevation`.

### 4. PageHeader hairline

`components/shell.tsx` `PageHeader` becomes:

```tsx
return (
  <div className="flex items-center justify-between pb-3 mb-4 border-b border-border">
    <h1 className="text-base font-semibold">{title}</h1>
    {actions && <div className="flex items-center gap-2">{actions}</div>}
  </div>
);
```

- `subtitle` parameter retained for back-compat but silently ignored
  (it was already a smell per DESIGN.md). Existing callers don't pass
  it — verified via `grep PageHeader src/pages` — so this is a no-op
  in practice. (If a caller is added later that needs supplementary
  text, the design conversation should be reopened.)
- `mb-4` (16px) stays — the consistent gap below the title is what
  pages currently rely on for vertical rhythm.

### 5. Sidebar grouping + active indicator

`components/shell.tsx` `Shell`:

- Workspace nav becomes three groups:

  ```ts
  const WS_GROUPS = [
    {
      labelKey: "nav.groupWorkspace" as const,
      items: [
        { to: "/dashboard", key: "nav.dashboard", Icon: Gauge },
        { to: "/keys",      key: "nav.apiKeys",   Icon: Key },
        { to: "/logs",      key: "nav.usageLogs", Icon: Activity },
        { to: "/playground", key: "nav.playground", Icon: PlayCircle },
        { to: "/generations", key: "nav.generations", Icon: ImageIcon },
      ],
    },
    {
      labelKey: "nav.groupAccount" as const,
      items: [
        { to: "/billing", key: "nav.billing", Icon: CircleDollarSign },
        { to: "/settings/connections", key: "nav.settingsConnections", Icon: Shield },
        { to: "/settings/security",    key: "nav.settingsSecurity",    Icon: Settings },
      ],
    },
    {
      labelKey: "nav.groupReference" as const,
      items: [
        { to: "/models", key: "nav.models", Icon: CpuIcon },
        { to: "/docs",   key: "nav.docs",   Icon: BookOpen },
      ],
    },
  ];
  ```

  Each group: `<div className="text-[11px] text-muted-foreground
  px-2 pt-3 pb-1">{t(group.labelKey)}</div>` (first group's `pt-3`
  drops to `pt-1` to avoid double-spacing under the brand).

- Admin sidebar (`ADMIN_NAV`) stays a single flat list — 5 items don't
  justify subdivision.

- Active item gains a leading 2px accent bar via pseudo:

  ```tsx
  cn(
    "relative flex items-center gap-2 px-2 py-1 rounded-md text-[13px]",
    isActive
      ? "bg-surface-2 text-foreground before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-0.5 before:bg-accent before:rounded-r-sm"
      : "text-muted-foreground hover:text-foreground hover:bg-surface-2",
  )
  ```

  The active item already has `bg-surface-2`; the accent bar is the
  new affordance.

i18n keys added:

```ts
// dict-en.ts
"nav.groupWorkspace": "Workspace",
"nav.groupAccount":   "Account",
"nav.groupReference": "Reference",

// dict-zh.ts
"nav.groupWorkspace": "工作区",
"nav.groupAccount":   "账户",
"nav.groupReference": "参考",
```

The existing `nav.sectionWorkspace` / `nav.sectionAdmin` keys are kept
but only `nav.sectionAdmin` remains in use (admin sidebar keeps its
single "Admin" header). The `nav.sectionWorkspace` key becomes
unreferenced — we delete it together with its dict entries to avoid
i18n drift.

### 6. Page migrations

#### `pages/dashboard.tsx`

- 4 `KpiTile` → `KpiStrip` with the same 4 items. "Failures (recent)"
  cell uses `KpiStrip`'s `onClick` to navigate to
  `/logs?status=failed` (replaces the current `<button>` wrapper).
- `Recent activity` Card → bare section: `<div className="mb-2 flex
  items-center justify-between"><h3 className="text-xs
  text-muted-foreground">…</h3>…</div>` + `<ul>` directly below. Empty
  state moves to `<EmptyState …>`.
- `Top models` Card + nested `CardHeader` for `Top API keys` → two
  bare sections under one column. The "card-with-nested-header"
  pattern in the current code is replaced with two sibling sections.

#### `pages/admin/overview.tsx`

- 4 outer `KpiTile` → `KpiStrip`.
- Inner "Today by type" `Card` containing 3 `KpiTile` → keep as a
  `Card` (we do want grouping here); the inner tiles become a small
  inline metric trio using a private inline component (still
  `text-xs` label + `mono` value), no nested KpiTile needed.

#### `pages/billing.tsx`

- 4 `KpiTile` → `KpiStrip`. The 4th cell ("by-type-month" breakdown)
  is a `value: <BillingBreakdown … />` since `KpiStrip` accepts
  `ReactNode` for value. The breakdown table inside the cell keeps
  its existing 3-row layout.
- Transactions empty `TableCell` → `EmptyState` (compact, inside the
  `colSpan` cell).

#### Empty-state replacements (no other layout change)

| File:line | Now | Becomes |
|:--|:--|:--|
| `pages/dashboard.tsx:82` | hand-rolled `<div>` with link split | `<EmptyState title="…" action={<Link>…</Link>} />` |
| `pages/usage-logs.tsx:96` | `<TableCell colSpan=8>` text-center | `<TableCell colSpan=8><EmptyState ... /></TableCell>` |
| `pages/api-keys.tsx:196` | same pattern | same replacement |
| `pages/billing.tsx:89` | same | same |
| `pages/models.tsx:69` | div fallback | `<EmptyState …/>` |
| `pages/generations.tsx:48` | `CardContent` text | `<EmptyState … action={<Link …/>} />` inside the card |

The dashboard `StatRows` inner empty (`<div className="p-3 text-xs
text-muted-foreground">`) **stays inline** — it's a list within a
list, not a top-level empty surface, so `<EmptyState>` is too heavy
there.

### 7. Arbitrary text size cleanup

`grep -rn 'text-\[10px\]' src/` returns 3 hits — all in pages where
`text-[11px]` (the documented `label` size) is the right replacement:

- `pages/models.tsx:58` (`Badge variant="outline" className="text-[10px] font-normal"`) → drop the override; `Badge` already sets `text-[11px]` by default. Verify by reading `ui/badge.tsx`.
- `pages/models.tsx:89` → `text-[11px]`.
- `pages/generations.tsx:80` (`text-[10px] text-muted-foreground`) → `text-[11px] text-muted-foreground`.
- `pages/playground.tsx:82` (same pattern) → `text-[11px] text-muted-foreground`.

`text-[9px]` (TypeBadge) and `text-[13px]` (sidebar nav) are
DESIGN.md-sanctioned exceptions and stay.

## Migration risks & rollback

- **KpiTile → KpiStrip is breaking** at the call site (different
  prop shape). All 3 callers are migrated in this PR; there are no
  external callers (the component is internal). If we hit unexpected
  rendering issues, `KpiTile` is retained in the source tree
  alongside `KpiStrip` for one release cycle so a revert is local.
- **Sidebar grouping affects every workspace page** but is purely
  visual; nav routes / paths don't change.
- **Shadow removal on `popover`/`select`** could make dropdown
  surfaces feel less floaty against `bg-surface-2` hover rows. The
  existing `border border-border` + `bg-popover` (`surface`) carries
  the contrast — we'll validate by walking through each Select-using
  page after the change.
- **PageHeader change** is global to every workspace + admin page —
  manual QA covers all of them; if a page is missing the page-level
  `<PageHeader>` wrapper, it gets caught visually.

## Testing

- `npm run build` (runs `tsc -b` then Vite). Must pass — strict
  type-checking on the new components and updated `PageHeader`
  signature catches accidental breakage.
- `cd frontend && npm run dev`, then manual walkthrough of the route
  list below in both `en` and `zh` (LanguageSwitcher in sidebar
  popover):
  - `/` (landing — no PageHeader, should be unchanged)
  - `/login`
  - `/dashboard`
  - `/keys`
  - `/logs`, `/logs?status=failed`
  - `/playground`
  - `/generations`
  - `/billing`
  - `/models`
  - `/docs`
  - `/settings/connections`
  - `/settings/security`
  - `/admin`, `/admin/users`, `/admin/models`, `/admin/providers`, `/admin/logs`
- Verification checklist per page:
  - PageHeader has a hairline underneath, title left, actions right.
  - KPI strip on dashboard / admin-overview / billing reads as one
    horizontal band with vertical dividers and no outer border.
  - Sidebar shows 3 groups in workspace mode; 1 group in admin mode.
  - Active sidebar item shows a 2px accent leading bar.
  - All `Input` / `Textarea` / `Select` / `Popover` surfaces are
    flat (no drop shadow).
  - Empty states on each list/table use the new `EmptyState`.
- Playwright (MCP) drive-through: navigate to the routes above as an
  authenticated user, take a screenshot of each, verify no console
  errors in the browser logs.

## Open questions

None at design-doc time. Spec is committed before code; if anything
falls out during implementation it gets resolved by re-reading this
file or, if material, recorded in the commit message.
