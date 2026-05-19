# Linear-style UI refresh — design

**Status**: draft, awaiting user review
**Date**: 2026-05-19
**Scope**: `frontend/` only. No backend, no API, no schema changes.

## 1. Why

The Relay frontend was originally designed as a "developer operator console" — dark
theme, mono numbers, uppercase tracked label-caps, and a `36px` control rhythm. After
auditing the live screens against Linear (see `.superpowers/brainstorm/…/content/01-shell-chrome.html`
and `02-dashboard-density.html`), we concluded that:

- Linear renders the same information density we want, but at **~24–28px control
  heights and lowercase labels** — meaning each screen surfaces 20-30% more rows.
- Our `text-2xl` KPI values, `p-4` card paddings, and double-pill activity rows
  carry more visual chrome than the data they frame.
- The uppercase tracked labels (`label-caps`, `label-caps-xs`) read as 2010-era
  "k8s dashboard" styling rather than the 2026 Linear/Stripe-internal aesthetic
  Relay's `DESIGN.md` already names as its reference.

**Decision**: do a one-shot conversion to Linear-style control sizing and labelling
across the entire workspace + admin app. Keep the color palette and the mono/sans
split. Drop uppercase tracked labels.

## 2. What stays the same

- Color tokens (`bg`, `surface`, `surface-2`, `surface-3`, `border`, `accent`,
  semantic colors). `DESIGN.md § Colors` is unchanged.
- The Geist sans / Geist Mono split. Numbers, IDs, model names, paths stay mono.
- The shell layout: 224px sidebar + flexible main + `max-w-[1600px]` content. The
  sidebar **width does not change**, only its internal density.
- All accessibility hooks (focus ring tokens, `aria-*` attributes, keyboard
  navigation). Sidebar footer collapses behind a popover but remains keyboard
  reachable.
- i18n: all dictionary strings are already in normal case. CSS does the uppercase
  visually; removing `text-transform: uppercase` doesn't touch `dict-en.ts` /
  `dict-zh.ts`.
- All routing, auth flows, gateway behavior.

## 3. The new size system

| Token | Old | New | Used by |
|:--|:--|:--|:--|
| `--control-h-sm` | (n/a) | **24px** | Tight buttons, ghost icon actions in tables |
| `--control-h` | 36px | **28px** | Default `Button`, `Input`, `Select`, `Tabs` trigger |
| `--control-h-lg` | 40px | **36px** | Reserved for landing CTAs only |
| Table head height | 36px | **28px** | `TableHead` |
| Table cell padding | `px-3 py-2` | `px-3 py-1.5` | `TableCell` |
| KpiTile padding | 16px | **12px** | `KpiTile` |
| KpiTile value | `text-2xl` (24px) | **`text-lg` (18px)** | `KpiTile.value` |
| Card content padding | 16px | **12px** (default), `dense` 8px | `CardContent` |
| Card header padding | 16px + border-b | **10px 14px**, optional border-b | `CardHeader` |
| Sidebar nav item | `py-1.5 text-sm` (14px) | **`py-1 text-[13px]`** | `Shell` |
| Sidebar brand header | `p-4 border-b` | **`px-3 py-2.5` no border** | `Shell` |
| PageHeader title | `text-xl` (20px) | **`text-base font-semibold`** (16px) | `PageHeader` |
| PageHeader bottom margin | `mb-6` (24px) | **`mb-4`** (16px) | `PageHeader` |
| Dialog padding | `p-6` (24px) | **`p-5`** (20px) | `DialogContent` |

The size scale token names are advisory — implementation uses Tailwind utilities
directly (`h-7`, `h-6`, etc). The names exist for `DESIGN.md` documentation.

## 4. The new label system

**Drop uppercase tracked across the board, except for the 3-letter modality pill.**

| Element | Old style | New style |
|:--|:--|:--|
| Sidebar section heading | `text-[10px] uppercase tracking-wider` | `text-[11px] text-muted-foreground` with optional chevron caret (lowercase) |
| KPI label | `text-[10px] uppercase tracking-wider` | `text-xs text-muted-foreground` (12px, normal case) |
| Table head | `text-[11px] uppercase tracking-wider` | `text-xs text-muted-foreground font-medium` (12px, normal case) |
| Status `Badge` (success/warn/danger/info) | `text-[10px] uppercase tracking-wider rounded-full + colored bg/border` | **New variant: dot-status** — `inline-flex items-center gap-1.5` + 6px colored dot + `text-xs text-foreground` (e.g. `● success`) |
| `TypeBadge` (TXT / IMG / VID / MUL) | `text-[10px] uppercase tracking-wider pill` | **Stays uppercase** (these are abbreviations), but pill becomes thinner (px-1 py-0) and smaller (text-[9px]) |
| KpiTile value | `mono font-semibold text-2xl` | `mono font-semibold text-lg` |
| Card title | `text-sm font-semibold` | `text-xs font-medium text-muted-foreground` (Linear's "section label" feel) |

The `Badge` primitive keeps its existing variants for cases where a true pill is
warranted (e.g. transaction type chips in Billing). The default *status* presentation
in tables and activity feeds switches to dot-status via a helper.

## 5. New patterns

### 5.1 Dot-status (replaces status Badge in tables and feeds)

```tsx
// frontend/src/components/dot-status.tsx (new file)
export function DotStatus({ status }: { status: RequestStatus | TaskStatus }) { ... }
```

Renders a 6px colored dot + lowercase label in `text-xs text-foreground`. Status →
color map matches existing `statusBadgeVariant`. Used by:

- Dashboard recent activity rows
- Usage Logs table status column
- Generations status column
- Admin logs

The full `Badge` pill is retained for: transaction types (Billing), API key
status column (active/disabled/revoked — these read as state labels, not
ephemeral request status), and any badge call site where the *category* meaning
outweighs the *current state* meaning.

### 5.2 Sidebar user popover (replaces stuffed footer)

`Shell` footer collapses from 3 stacked rows to a single 40px row containing the
avatar and display name. The whole row is a button that opens a Radix popover
anchored above with:

- Account email (mono)
- Switch to admin (if `user.role === "admin"` and currently in workspace area)
- Switch to workspace (if currently in admin area)
- Language switcher (compact)
- Sign out

This frees ~36px at the bottom of every page.

### 5.3 PageHeader: smaller title, inline actions

`PageHeader` title goes from `text-xl` (20px) to `text-base font-semibold` (16px),
`mb-6` to `mb-4`. The `subtitle` prop is already deprecated per
`DESIGN.md`; this spec keeps it removed.

### 5.4 Filter bar pattern

Usage Logs (and any future list page) uses a tight pill row instead of
`Select`/`Input` triple. Pills look like `Type: all ▾` with the `▾` opening a
Radix popover, plus a dashed `+ Filter` trailing pill to add filters. The
underlying `Select` primitive is reused.

Out of scope for first pass: building a "filter chip" wrapper as a new primitive.
We achieve the visual change by using `size="sm"` (24px) on existing
`Select`/`Input` and adjusting trigger styling per call site. A proper
`<FilterPill>` primitive is a follow-up.

### 5.5 Row actions in tables

API Keys row-actions trio (`<Button icon> + <Button outline sm> + <Button icon
danger>`) is the worst offender. Replace with:

- One row → icon group (4 ghost icon buttons at `h-6 w-6`):
  `Disable`/`Enable`, `Edit`, `Copy prefix`, `Delete`.
- Default: rendered at `opacity-50` at rest, `opacity-100` on row hover or
  keyboard focus. Still discoverable (no "where are my actions?" moment), but
  visually recedes when the user is scanning rather than acting.

Same pattern applies to admin user/model list pages.

## 6. Component-level change list

These are the exact files this spec authorizes editing. Anything not on this list
must not be touched in the same PR.

### Primitives (`frontend/src/components/ui/`)

- `button.tsx` — size variants: `default` h-7 / `sm` h-6 / `lg` h-9 (was h-9 / h-8 / h-10). All paddings reduced one step.
- `input.tsx` — `h-9 → h-7`.
- `select.tsx` — `h-9 → h-7`; SelectItem padding `py-1.5 → py-1`.
- `textarea.tsx` — match `Input` baseline.
- `card.tsx` — Card unchanged; `CardHeader` defaults to `px-3.5 py-2.5` and gains `border-b` only when explicitly passed (default off); `CardContent` defaults to `p-3`; `CardTitle` becomes `text-xs font-medium text-muted-foreground`.
- `badge.tsx` — drop `uppercase tracking-wider` from default base; reduce padding to `px-2 py-0`, text-[11px]; semantic variants unchanged otherwise. Add no new variant — dot-status is a separate component.
- `table.tsx` — `TableHead` becomes `h-7 px-3 text-xs text-muted-foreground font-medium` (drop uppercase tracking); `TableCell` `px-3 py-1.5`.
- `tabs.tsx` — `TabsList h-9 → h-7`, padding scaled, active trigger `data-[state=active]:bg-surface` unchanged.
- `dialog.tsx` — `DialogContent p-6 → p-5`; `DialogTitle text-base → text-sm`.

### Composite (`frontend/src/components/`)

- `shell.tsx` — Sidebar header tightens; section labels go lowercase + smaller; nav items go from `py-1.5 text-sm` to `py-1 text-[13px]`; footer collapses behind popover (new code).
- `shell.tsx :: PageHeader` — title `text-xl → text-base`, container `mb-6 → mb-4`.
- `kpi-tile.tsx` — padding `p-4 → p-3`; label lowercase normal-case `text-xs text-muted-foreground`; value `text-2xl → text-lg`.
- `type-badge.tsx` — keeps uppercase 3-letter abbreviation, but pill becomes `text-[9px] px-1 py-0` with `h-3 w-3` icon.
- `provider-tag.tsx` — same treatment as `type-badge.tsx` (smaller).
- `language-switcher.tsx` — `compact` mode shrinks to fit the 28px row; non-compact stays the same.
- `log-detail-drawer.tsx` — applies new control sizes to its action footer only. Drawer interior layout unchanged.

### New files

- `frontend/src/components/dot-status.tsx` — the `<DotStatus>` component described in §5.1.
- `frontend/src/components/shell-user-menu.tsx` — the user popover described in §5.2 (only if `shell.tsx` would grow past ~220 lines; otherwise inline).

## 7. Page-level change list

These pages call into the primitives. Most changes happen automatically via the
primitive updates. The list below names the *explicit overrides* each page
currently has that must be reconciled:

- `pages/dashboard.tsx` — replace activity-list `Badge` → `DotStatus`; combine the two
  `StatList` cards into one `Card` with two sections (one shared border).
- `pages/usage-logs.tsx` — filter selects move to `size="sm"`; status column → `DotStatus`.
- `pages/api-keys.tsx` — row-actions trio → hover-revealed icon group; status column keeps `Badge` (state label, not request status).
- `pages/billing.tsx` — KpiTile auto-shrinks via primitive change; transaction-type column keeps `Badge` (category label).
- `pages/generations.tsx` — status → `DotStatus`; controls shrink via primitive change.
- `pages/models.tsx` — table head/cell auto-shrink via primitive change.
- `pages/playground.tsx` — model dropdown sized via primitive change; chat bubbles unaffected.
- `pages/admin/*.tsx` — auto-benefit from primitive changes. Mirror the API Keys row-action change in admin/users and admin/models if they have similar trios.

`pages/landing.tsx` and `pages/login.tsx` are **explicitly out of scope** for the
control-height shrink. The landing hero stays at its current scale (it's the
marketing surface), and the login pill was just shipped (`c4e66ee`). However:

- The landing nav buttons inherit `Button.default = h-7` — this is intentional
  and acceptable.
- The login page's pill buttons explicitly call out their own dimensions and are
  not affected.

## 8. `DESIGN.md` rewrite

`DESIGN.md` is the source of truth (per `CLAUDE.md`). After code lands, update:

- `§ Typography` — remove `label-caps` and `label-caps-xs` size tokens; replace
  references with `body-sm muted` notes.
- `§ Layout` — update Tables row to "h-7 head row (28px), px-3 py-1.5 cells".
- `§ Components` table — update Button, Input, Select, Tabs, Table, Card,
  KpiTile, TypeBadge dimensions to reflect new values.
- `§ Do's and Don'ts` — replace "Use `<PageHeader title={...} />`" entry to
  reference new size; add "Use `<DotStatus>` for request/task status in tables
  and feeds; reserve `<Badge>` for category/state labels."
- Add new section `§ DotStatus pattern` with examples.
- Add new section `§ Hover-revealed actions` with the table row pattern.

## 9. Out of scope (deferred follow-ups)

- A proper `<FilterPill>` primitive — current pass uses size variants on
  existing primitives.
- Keyboard shortcut hints (`⌘K`, `J/K` for table nav) — Linear-defining but
  large enough to be its own design.
- A `<Kbd>` primitive for showing key combinations in tooltips.
- Refactoring `log-detail-drawer.tsx`'s internal layout (only the action
  footer is touched here).
- Density-toggle (per-user "compact vs comfortable"). Linear has it, we don't
  need it yet.
- Admin landing page redesign — only sizing changes inherit.
- Translating zh/en string content. (Visual treatment only.)

## 10. Verification

A change is "done" when:

1. `cd frontend && npm run build` succeeds (this runs `tsc -b` then `vite
   build` — type errors fail it).
2. Every affected page renders in the dev server without console errors.
3. A manual smoke test of these flows:
   - Log in (workspace user)
   - Land on Dashboard → KPIs and activity render
   - Open Usage Logs → filter, click a row → drawer opens with new control sizes
   - Open API Keys → create dialog opens at new padding; row hover reveals
     action icons; create flow still produces the reveal modal
   - Open Billing → transactions list renders with original `Badge` chips
   - Open Playground → chat works
   - Switch to admin → all primitive changes carry through
4. `DESIGN.md` matches code (per CLAUDE.md "the code is right when they
   disagree" rule — we update DESIGN.md in the same PR).

No new pytest coverage required (no backend changes). No new TS unit tests for
primitives (the existing `tsc -b` strictness is the safety net).

## 11. Risks & mitigations

| Risk | Mitigation |
|:--|:--|
| 28px buttons read as "small / tappable on mobile?" — Relay is desktop-only, but accessibility audit might flag tap targets. | This is a desktop developer console (DESIGN.md §Overview names this). 28px is above WCAG AA 24px minimum for non-mobile. Document in `DESIGN.md § Accessibility`. |
| Dropping uppercase tracked breaks visual familiarity for existing internal users. | One-shot change with a brief CHANGELOG note. Acceptable — no external users. |
| `<DotStatus>` introduces a second status presentation alongside `<Badge>` — risk of inconsistent use. | Add a §Do's-and-Don'ts entry: dot-status for request/task lifecycle status; Badge for category/state labels. Code review will catch drift. |
| Hover-revealed table actions hurt discoverability — new users may not realize they can edit/delete. | Show the icon group at low opacity at rest, full opacity on hover. Still readable. |
| Primitive changes affect landing/login despite being "out of scope". | Audit `pages/landing.tsx` and `pages/login.tsx` after the primitive PR; lock their explicit dimensions where they currently rely on `h-9` defaults that they actually want. Add a TODO in the spec output if any drift is found. |

## 12. Sequencing

Recommended commit / PR sequence:

1. **PR-1: primitives** — update `ui/button.tsx`, `ui/input.tsx`, `ui/select.tsx`, `ui/textarea.tsx`, `ui/card.tsx`, `ui/badge.tsx`, `ui/table.tsx`, `ui/tabs.tsx`, `ui/dialog.tsx`. Audit landing + login for visual regressions. Build & smoke test.
2. **PR-2: composites** — update `shell.tsx` (sidebar + PageHeader + footer popover), `kpi-tile.tsx`, `type-badge.tsx`, `provider-tag.tsx`, `language-switcher.tsx`. Add `dot-status.tsx`.
3. **PR-3: pages** — page-specific overrides per §7. Includes API Keys row-actions refactor, Dashboard StatList merge.
4. **PR-4: docs** — `DESIGN.md` rewrite per §8.

Each PR independently buildable and smoke-testable. PR-4 must land in the same
branch as PR-3 (or together) to satisfy the CLAUDE.md rule that code and
`DESIGN.md` stay in sync.

For implementation in this session, we'll likely fold PRs 1–3 into a single
commit/PR since they're tightly coupled, and keep PR-4 (`DESIGN.md`) as a
separate commit in the same branch for review clarity.
