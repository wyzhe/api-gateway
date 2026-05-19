---
version: alpha
name: Relay
description: >
  Self-hosted LLM API gateway. Dark-only operator console — terminal-adjacent,
  high information density, monospaced where it earns its keep. Aesthetically
  closer to a developer log viewer (Vercel/Linear/Stripe internal tools) than to
  a consumer SaaS.
colors:
  background: "#0a0b0d"
  surface: "#111316"
  surface-2: "#16191d"
  surface-3: "#1b1e23"
  border: "#23262b"
  border-strong: "#2e3239"
  border-soft: "#1b1e22"
  foreground: "#eceef1"
  muted-foreground: "#9097a1"
  faint: "#5c636d"
  dim: "#43484f"
  accent: "#7be38b"
  accent-dim: "#4f9e5c"
  accent-foreground: "#0a0b0d"
  success: "#4ade80"
  warn: "#f5b544"
  danger: "#f87171"
  info: "#7ab7ff"
  openai: "#10a37f"
  anthropic: "#d97757"
  gemini: "#5b8def"
  xai: "#b8b8b8"
  veo: "#c084fc"
  apimart: "#7be38b"
typography:
  page-title:
    fontFamily: Geist
    fontSize: 1.25rem
    fontWeight: 600
  section-title:
    fontFamily: Geist
    fontSize: 0.875rem
    fontWeight: 600
  body:
    fontFamily: Geist
    fontSize: 0.875rem
    fontWeight: 400
  body-sm:
    fontFamily: Geist
    fontSize: 0.75rem
    fontWeight: 400
  label-caps:
    fontFamily: Geist
    fontSize: 0.6875rem
    fontWeight: 500
    letterSpacing: 0.08em
    fontFeature: "ss01, cv11"
  label-caps-xs:
    fontFamily: Geist
    fontSize: 0.625rem
    fontWeight: 500
    letterSpacing: 0.08em
  mono:
    fontFamily: Geist Mono
    fontSize: 0.875rem
  mono-sm:
    fontFamily: Geist Mono
    fontSize: 0.75rem
  hero:
    fontFamily: Geist
    fontSize: 3rem
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: -0.02em
rounded:
  sm: 6px
  md: 8px
  lg: 10px
  xl: 12px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  "2xl": 32px
  "3xl": 64px
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-foreground}"
    rounded: "{rounded.md}"
    height: 36px
    padding: "0 16px"
  button-outline:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    height: 36px
    padding: "0 16px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    height: 36px
    padding: "0 16px"
  button-destructive:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    height: 36px
    padding: "0 16px"
  input:
    backgroundColor: "{colors.surface-3}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    height: 36px
    padding: "0 12px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: 16px
  badge-default:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.muted-foreground}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  badge-success:
    backgroundColor: "color-mix(in oklch, {colors.success} 10%, transparent)"
    textColor: "{colors.success}"
    rounded: "{rounded.full}"
  badge-warn:
    backgroundColor: "color-mix(in oklch, {colors.warn} 10%, transparent)"
    textColor: "{colors.warn}"
    rounded: "{rounded.full}"
  badge-danger:
    backgroundColor: "color-mix(in oklch, {colors.danger} 10%, transparent)"
    textColor: "{colors.danger}"
    rounded: "{rounded.full}"
  badge-info:
    backgroundColor: "color-mix(in oklch, {colors.info} 10%, transparent)"
    textColor: "{colors.info}"
    rounded: "{rounded.full}"
  tabs-list:
    backgroundColor: "{colors.surface-2}"
    rounded: "{rounded.md}"
    height: 36px
    padding: 4px
  tab-active:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.sm}"
  table-head:
    typography: "{typography.label-caps}"
    textColor: "{colors.muted-foreground}"
    height: 36px
    padding: "0 12px"
  table-row-hover:
    backgroundColor: "{colors.surface-2}"
  dialog:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: 24px
  sidebar:
    backgroundColor: "{colors.surface}"
    width: 224px
---

## Overview

Relay is a self-hosted developer tool. The UI is a **dark-only operator
console** designed for engineers who already live in a terminal. Aesthetic
references: Vercel dashboard, Linear settings, Stripe internal tools. **Not**
references: consumer SaaS marketing pages, AI chat playgrounds, fintech apps
that try to feel friendly.

Three things define the feel:

1. **Information density over whitespace.** Tables are dense, KPI cards stack
   four-up, sidebar is narrow. A typical page should fit "what changed today"
   on a single screen without scrolling.
2. **Mono everywhere it earns its keep.** Numbers, IDs, prefixes, code, paths,
   model names, currency — all monospaced. Prose is sans. The mono/sans split
   tells the eye what is data and what is chrome.
3. **Green accent, used sparingly.** `#7be38b` (`--accent`) is the only
   interactive-confident color. If everything is accented, nothing is. Reserve
   it for: primary buttons, the active sidebar item, success badges, the brand
   mark, and emphasis text on the landing page hero.

The product is admin-managed and invite-only — there is no "wow, sign up
today" moment. The landing page exists to explain the system to a developer
the admin is inviting, not to convert anonymous traffic.

## Colors

The palette is a near-black base with a single warm green accent. All semantic
status colors are desaturated enough to coexist on the same dark background
without one stealing the eye.

- **`background` `#0a0b0d`** — the page. Used only on the outermost `<body>`
  and on landing sections that visually "extend" the page.
- **`surface` `#111316`** — the default card, sidebar, dialog. Anything that
  the user is asked to read content out of.
- **`surface-2` `#16191d`** — one tier in: form inputs' parent panel, tab
  list, hover state on rows, KPI tiles inside the landing console preview.
- **`surface-3` `#1b1e23`** — form inputs themselves; the deepest "the user
  is editing something" tier.
- **`border` `#23262b`** — the universal hairline. Use it for every card,
  input, table row separator, section divider.
- **`border-strong` `#2e3239`** — emphasis border (rare; used on focus-ring
  offset).
- **`foreground` `#eceef1`** — body text, headings.
- **`muted-foreground` `#9097a1`** — secondary text, sidebar nav labels,
  table column headers, helper text under inputs.
- **`faint` `#5c636d`** / **`dim` `#43484f`** — for "almost invisible" labels
  like the `BASH`/`JSON` lang chip inside `CodeBlock`. Don't use for any text
  the user actually has to read.
- **`accent` `#7be38b`** — primary action color. Buttons (default variant),
  active sidebar item, switch-on state, brand square, hero emphasis word.
  Never use as a background for blocks of text.
- **`accent-foreground` `#0a0b0d`** — the dark text that goes on top of
  `accent`-tinted surfaces. Always use this pair together.
- **Semantic**: `success #4ade80`, `warn #f5b544`, `danger #f87171`,
  `info #7ab7ff`. All four are exposed as background tints (`/10`),
  borders (`/40`), and full color for text. The pattern is identical
  across the four — pick by meaning, not by color.
- **Provider brand colors** (`openai`, `anthropic`, `gemini`, `xai`, `veo`,
  `apimart`): used **only** in the `ProviderTag` component and the
  `TypeBadge` for the `multimodal` modality. They are not for general use —
  reaching for them outside those two components is a smell.

### Color rules

1. **Never use raw hex / rgb in component code.** Every color must come from
   a CSS variable (`var(--accent)`) or, preferably, a Tailwind utility
   (`bg-accent`, `text-muted-foreground`). All tokens are exposed via
   `@theme inline` in `frontend/src/index.css`.
2. **Tints use `color-mix(in oklch, var(--token) N%, transparent)`** rather
   than hand-picked rgba. This keeps the tint in lockstep with the base
   token if it ever changes.
3. **Pair accent with `accent-foreground`.** Never put `foreground` on
   `accent` — the contrast goes wrong because `accent-foreground` is dark.

## Typography

Two families, intentional split:

- **`Geist` (sans)** — every piece of prose: titles, body, nav labels,
  buttons, paragraph text.
- **`Geist Mono`** — every piece of "machine output": numbers, money,
  durations, IDs, API key prefixes, model names, code, paths.

The mono/sans switch is a load-bearing signal. A column labeled "Cost" should
be rendered in mono so that decimals visually align across rows; the same
column's header ("COST") is sans + uppercase + tracked. Don't mix them inside
one cell.

Size scale used in the app:

| Token | Size | Used for |
|:--|:--|:--|
| `hero` | 3rem / 600 / -0.02em | Landing hero `<h1>` |
| `page-title` | 1.25rem / 600 | `PageHeader` title (every workspace/admin page) |
| `section-title` | 0.875rem / 600 | `CardTitle`, dialog title |
| `body` | 0.875rem / 400 | The default. Form labels, paragraph copy, table cells. |
| `body-sm` | 0.75rem / 400 | Helper text under inputs, footer, caption rows. |
| `label-caps` | 0.6875rem / 500 / 0.08em / uppercase | Table column headers, KPI label, section eyebrow ("QUICKSTART"). |
| `label-caps-xs` | 0.625rem / 500 / 0.08em / uppercase | Sidebar section heading ("WORKSPACE"), badge text, status pill text. |
| `mono` | 0.875rem | Default mono cell. |
| `mono-sm` | 0.75rem | Mono in dense tables, code chips. |

### Typography rules

1. **There is no other size in the system.** If you reach for an arbitrary
   `text-[13px]` or `text-base`, you are introducing a new size. Pick from
   the table.
2. **Uppercase + letter-spaced + sm/xs is the "label cap" look.** Use it
   for any label that names a region of data (column header, KPI label,
   section eyebrow). Do not uppercase body text.
3. **Use `font-feature-settings: "ss01", "cv11"` on body** — already wired
   into `body { font-feature-settings }` in `index.css`. Don't override.

## Layout

Density rules. The viewport is treated as a workspace, not a canvas.

- **App shell** = 224px sidebar + flexible main column. Main column has a
  `max-width: 1600px` centered, `px-6 py-6`.
- **Landing** = ungated, no sidebar. Sections share a `max-w-6xl mx-auto px-6`
  container. Vertical rhythm is `py-16` per content section, `py-20 md:py-28`
  for the hero.
- **Cards** = `p-4` (16px). Card header gets `p-4 + border-b`, card footer
  `p-4 + border-t`. Inputs and form rows inside a card use `gap-3` (12px).
- **Tables** = `h-9` head row (36px), `px-3 py-2` cells. Sticky header is not
  used; "show me everything" is the default.
- **KPI grid** = `grid-cols-2 md:grid-cols-4 gap-3`. Always four KPIs at the
  top of a metrics page; if there are 5, pick four.
- **Dialog** = `max-w-lg` centered, `p-6` (24px), `gap-4` between sections.

### Spacing scale

`xs 4px · sm 8px · md 12px · lg 16px · xl 24px · 2xl 32px · 3xl 64px`

This is the Tailwind `gap-1 / gap-2 / gap-3 / gap-4 / gap-6 / gap-8 / gap-16`
ladder. **Do not use arbitrary `gap-[10px]` or `mt-7`**. If you find yourself
wanting one, the right answer is almost always to step up or down the scale.

### Viewport-relative sizing (escape hatch)

Some surfaces — dialog body scroll caps, log drawer height — have to track
the viewport, not the spacing scale. Tailwind has no token for this; use
`max-h-[70vh]` / `max-h-[80vh]` on those specific containers. The accepted
pattern is documented here so audits don't flag it. Don't extend the escape
hatch to other dimensions.

## Elevation & Depth

We do not use elevation as a metaphor. There is no Material-style "this card
floats above that card." Hierarchy comes from **borders + surface tiers**, not
from shadows.

The only shadows used:

- **Dialog**: `shadow-lg` on the dialog content. This is the one place where
  a real shadow is OK because the overlay already darkens the rest.
- **Switch thumb**: `shadow-lg` on the thumb, to read against the green
  switched-on background.

No card / KPI / sidebar / table row / button has a shadow. If a card needs to
"come forward" relative to its siblings, the move is `bg-surface-2` and one
hairline border, not a drop shadow.

## Shapes

Corners are quietly rounded — `8px` is the default, the hairline border does
the structural work.

| Token | Pixel | Used for |
|:--|:--|:--|
| `sm` | 6px | Tab triggers (inner state), badge "pill" only when `rounded-sm` is specified — most badges use `full`. |
| `md` | 8px | **The default.** Buttons, inputs, cards, dialogs, code blocks, KPI tiles. |
| `lg` | 10px | Reserved. Currently unused but available for any "feels chunky" surface (e.g. an inspector panel). |
| `xl` | 12px | Reserved. |
| `full` | 9999px | Badges, status pills, the dot indicators in sidebar nav. |

### Shape rules

1. **Default is `rounded-md`.** Reach for it first.
2. **`rounded-full` is only for badges, dots, and the green icon backplate
   on landing capability cards.** Never put a `rounded-full` shape on
   something the user is meant to type into.

## Components

Components live under `frontend/src/components/ui/` (primitives) and
`frontend/src/components/` (composite). The primitive folder is the shadcn-style
hand-written set. **Don't run `shadcn` CLI** — see CLAUDE.md.

### Primary components

| Component | File | Use for |
|:--|:--|:--|
| `Button` | `ui/button.tsx` | All clickable buttons. Variants: `default`, `outline`, `ghost`, `destructive`, `secondary`, `link`. Sizes: `default`, `sm`, `lg`, `icon`. |
| `Badge` | `ui/badge.tsx` | Status pills, type labels. Variants: `default`, `success`, `warn`, `danger`, `info`, `accent`, `outline`. |
| `Card` | `ui/card.tsx` | Any grouping of content. Compose `Card > CardHeader > CardTitle/CardDescription` + `CardContent` + `CardFooter`. |
| `Input` | `ui/input.tsx` | All single-line text fields. `bg-input` (`surface-3`), `h-9`, `rounded-md`. |
| `Textarea` | `ui/textarea.tsx` | Multi-line input. Same surface/border as `Input`. |
| `Select` | `ui/select.tsx` | Native-feel dropdown via Radix. |
| `Switch` | `ui/switch.tsx` | Binary toggle. On = `accent`. Use **only** for binary state — for choosing one of N, use `Tabs` or `Select`. |
| `Tabs` | `ui/tabs.tsx` | Top-of-page modality switcher (playground, models) — list is `h-9 bg-surface-2 p-1 rounded-md`, active trigger has `bg-surface`. |
| `Table` | `ui/table.tsx` | All tabular data. Head row is `h-9 + uppercase tracking-wider 11px muted`. Cells are `px-3 py-2`. Row hover = `bg-surface-2`. |
| `Dialog` | `ui/dialog.tsx` | Modal interactions: create-key reveal, edit forms. `max-w-lg`, `p-6`, `bg-surface`. |
| `Sheet` | `ui/sheet.tsx` | Right-side drawer (currently the log detail). |
| `CodeBlock` | `ui/code-block.tsx` | Any block of code or "machine string." Includes lang chip + copy button. Always prefer this over a raw `<pre>`. |
| `Label` + `FormField` | `ui/label.tsx`, `ui/form-field.tsx` | Form labels. `Label > Input` is the canonical pair. |

### Composite / shared

| Component | File | Use for |
|:--|:--|:--|
| `Shell` + `PageHeader` | `components/shell.tsx` | The workspace/admin layout. `PageHeader` carries `title` + optional `actions`. **Subtitles are removed** — see Do's/Don'ts. |
| `BrandMark` | `components/brand-mark.tsx` | The accent-green "R" square. Used in shell, landing nav, landing footer. Don't reimplement. |
| `LanguageSwitcher` | `components/language-switcher.tsx` | The `EN / 中文` pill. Lives in shell footer and landing header. |
| `KpiTile` | `components/kpi-tile.tsx` | The 4-up metric tile on dashboard / billing / admin overview. Use it; do not hand-roll. |
| `TypeBadge` | `components/type-badge.tsx` | The `TXT / IMG / VID / MUL` modality pill. Maps modality → icon + color. Reuse for any "what kind of request is this." |
| `ProviderTag` | `components/provider-tag.tsx` | OpenAI / Anthropic / Gemini / xAI / Veo / APIMart attribution. Reuse for any provider display. |
| `LogDetailDrawer` | `components/log-detail-drawer.tsx` | Shared drawer used by both user-side `usage-logs` and admin `logs`. Don't fork. |

### State pattern

Every interactive primitive defines four visual states, and all four are
exercised — not aspirational. If you add a new interactive primitive it must
ship with:

| State | Visual | Notes |
|:--|:--|:--|
| Default | Base token combination | — |
| Hover | One tier lighter surface (`surface → surface-2`), or `opacity-90` on accent | `transition-colors` is required |
| Focus | `ring-2 ring-ring ring-offset-1 ring-offset-background` | All focusable elements |
| Disabled | `opacity-50 pointer-events-none` | Standard across the board |
| Active (where applicable) | `data-[state=active]:bg-surface` on tab, `data-[state=checked]:bg-primary` on switch | — |

### Variants

`button` and `badge` use `cva` with named variants. **Do not add a one-off
variant by hand** — extend the `cva` config so the type system enforces it.

## Do's and Don'ts

| ✅ Do | ❌ Don't |
|:--|:--|
| Use `bg-accent text-accent-foreground` for primary CTAs. | Use raw `style={{ background: "var(--accent)" }}` — Tailwind utilities exist for every token. |
| Reach for an existing primitive (`Button`, `Badge`, `Card`) first. | Hand-roll a `<div className="rounded-md border …">` that duplicates a primitive. |
| Use `mono` for numbers, IDs, keys, model names, paths. | Mono on prose; sans on numbers. |
| Pick from the size scale: `text-xs / text-sm / text-base / text-xl / text-3xl` (rare). | Arbitrary sizes `text-[13px]`, `text-[17px]`. |
| Use the spacing scale: `gap-1 / 2 / 3 / 4 / 6 / 8`. | Arbitrary spacing `gap-[10px]`, `mt-7`. |
| Render every chunk of code via `<CodeBlock>` — it provides a lang chip + copy. | Bare `<pre>` blocks. |
| Use `color-mix(in oklch, var(--token) N%, transparent)` for tints. | Hand-tinted `rgba(123,227,139,0.12)`. |
| Use `<PageHeader title={...} />` — no subtitle, no description prose. | Adding `subtitle={t("page.subtitle")}` "for clarity." We removed them on purpose: they read as developer commentary aimed at the user. |
| Use `<TypeBadge type="image" />` for any "what modality" rendering. | A custom colored badge per page that duplicates the type→icon mapping. |
| Add an i18n key under `landing.*`, `playground.*`, `apiKeys.*` and call `t("...")`. | Hardcoded English strings in JSX. Both `dict-en.ts` and `dict-zh.ts` must stay in lockstep. |
| Use `bg-accent` only on small, intentional surfaces (CTA, brand mark, the active-tab indicator inside the sidebar). | Large green panels. Accent is for emphasis, not for filling area. |
| Use the green Shield in the sidebar footer (workspace side only) to enter admin. | Putting an "Admin" entry in the main nav alongside Dashboard/Keys/etc. — admin is intentionally separate. |
| Keep the user-facing API key prefix consistent: **`sk-`**. | The legacy `lgw_` prefix. Both DB rows and code paths use `sk-` exclusively. |
| Localize new strings as you add them. | Letting `dict-en.ts` get ahead of `dict-zh.ts` (or vice versa). The `EnDict` type makes the gap a TS error — fix it, don't `as any` past it. |

### Style mistakes that are easy to make in this codebase

1. **Inventing a button.** If the variant you want is "looks like outline but
   smaller padding," use `<Button variant="outline" size="sm" />`. Adding a
   `className="px-2 py-1"` override is a code smell.
2. **Forgetting `transition-colors`.** Every interactive surface that changes
   color on hover must transition. Bare hover state without transition reads
   as a flicker.
3. **Tinting outside the token system.** `bg-success/10` exists. So does
   `border-success/40` and `text-success`. The `/10` and `/40` are not
   arbitrary — they are the system's defined tint depths.
4. **Bypassing CodeBlock.** Every `<pre>` should be a `CodeBlock`; that's
   the only place where the user gets a clipboard copy button + language
   indicator. Hand-rolled `<pre>` blocks are bugs.
5. **Adding a 9th color.** All status meanings already have a color. If you
   need "warning but a different kind," reuse `warn` and disambiguate by
   text — don't add `warn-2`.

## Implementation pointers

- All tokens live in `frontend/src/index.css` under `:root` + `@theme inline`.
- All primitives live in `frontend/src/components/ui/` and are hand-written.
- Tailwind v4 — class names like `bg-accent`, `text-muted-foreground`,
  `bg-surface-2` map directly to the tokens above. No `tailwind.config.js`
  customization beyond `@theme inline`.
- When adding a new token: define it in `:root`, re-expose under `@theme
  inline`, and document it here.
- When adding a new component: add to `components/ui/` if it's a primitive
  (used by 3+ pages), or `components/` if it's a composite of primitives.
  Document it under "Components" in this file.

## Status

This DESIGN.md is the source of truth for visual decisions in Relay. When
in doubt, read it before reading individual page files. When the code and
this file disagree, **the code is wrong** — fix the code, do not retroactively
edit this file to match a regression.
