# Landing Switcher & Proof Strip Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the landing page's theme/language switchers as segmented controls and the hero proof strip as a 2×2 card grid.

**Architecture:** Three focused frontend tasks — rewrite `ThemeSwitcher` as an icon segmented control, rewrite `LanguageSwitcher` as a text segmented control (dropping its `compact` variant), and convert the `landing.tsx` hero proof strip into a 2×2 `ProofCard` grid. Each switcher's `DESIGN.md` description is updated in the same commit as the component. No new shared primitive — the existing `tabs-list` / `tab-active` visual tokens and the `Tooltip` primitive are reused.

**Tech Stack:** React 19, TypeScript (strict), Tailwind v4, lucide-react, Radix Tooltip. No frontend test runner exists — the verification gate is `npm run build` (`tsc -b && vite build`) plus browser checks.

**Reference:** Design spec at `docs/superpowers/specs/2026-05-21-landing-switcher-proof-strip-redesign-design.md`.

---

## Task 1: ThemeSwitcher → icon segmented control

The current `ThemeSwitcher` renders three plain-text buttons (`系统 · 亮色 · 暗色`) joined by `·` dots — it does not read as a control. Replace it with a segmented control whose three segments are icons (`Monitor` / `Sun` / `Moon`), reusing the `tabs-list` (`bg-surface-2` track) / `tab-active` (`bg-surface` pill) visual tokens. Each icon segment is `Tooltip`-wrapped and `aria-label`-ed since it has no visible text.

**Files:**
- Modify (full rewrite): `frontend/src/components/theme-switcher.tsx`
- Modify: `DESIGN.md` (the `ThemeSwitcher` row in the `### Composite / shared` table)

- [ ] **Step 1: Rewrite `frontend/src/components/theme-switcher.tsx`**

Replace the entire file with:

```tsx
import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import { useT, type TKey } from "@/lib/i18n";
import type { ThemePreference } from "@/lib/theme";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const OPTIONS: ReadonlyArray<readonly [ThemePreference, TKey, LucideIcon]> = [
  ["system", "theme.system", Monitor],
  ["light", "theme.light", Sun],
  ["dark", "theme.dark", Moon],
];

export function ThemeSwitcher({ className }: { className?: string }) {
  const { preference, setPreference } = useTheme();
  const t = useT();
  return (
    <div
      className={cn(
        "inline-flex h-7 shrink-0 items-center rounded-md bg-surface-2 p-0.5",
        className,
      )}
      role="group"
      aria-label={t("nav.theme")}
    >
      {OPTIONS.map(([value, key, Icon]) => {
        const active = preference === value;
        return (
          <Tooltip key={value} content={t(key)}>
            <button
              type="button"
              onClick={() => setPreference(value)}
              aria-pressed={active}
              aria-label={t(key)}
              className={cn(
                "inline-flex h-6 w-6 items-center justify-center rounded-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                active
                  ? "bg-surface text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
```

Notes:
- The `Fragment` import and the `·` separators are gone — the track background carries the grouping.
- Active segment is `bg-surface text-foreground` (the `tab-active` token) — **not** the green accent; `DESIGN.md` reserves `accent` for primary buttons / active sidebar item / etc.
- `Tooltip` accepts `content` + a single `children` and wraps it with `TooltipPrimitive.Trigger asChild`; a native `<button>` forwards refs, so wrapping the button directly is correct.
- `TooltipProvider` wraps every route in `App.tsx`, so the tooltip works on the landing page and inside the sidebar popover.

- [ ] **Step 2: Update the `ThemeSwitcher` row in `DESIGN.md`**

In the `## Components` → `### Composite / shared` table, replace this exact row:

```
| `ThemeSwitcher` | `components/theme-switcher.tsx` | The three-way `系统 / 亮 / 暗` (System / Light / Dark) theme control. Lives in the sidebar user Popover and the landing header. Mirrors `LanguageSwitcher` in structure. Takes only a `className` prop — there is no `compact` variant. |
```

with:

```
| `ThemeSwitcher` | `components/theme-switcher.tsx` | The three-way System / Light / Dark theme control — an icon segmented control (`Monitor` / `Sun` / `Moon`), same `bg-surface-2` track / `bg-surface` active-segment styling as `LanguageSwitcher`. Each segment is `Tooltip`-wrapped and carries an `aria-label`. Lives in the sidebar user Popover and the landing header. Takes only a `className` prop. |
```

- [ ] **Step 3: Verify the build passes**

Run: `cd frontend && npm run build`
Expected: PASS — `tsc -b` reports no errors and `vite build` completes. (If `lucide-react` has no `Monitor`/`Sun`/`Moon` export the type check fails here; all three are standard lucide icons in `lucide-react@^1.16.0`.)

- [ ] **Step 4: Visual check in the browser**

Run: `cd frontend && npm run dev`, open the landing page (`/`).
Verify:
- The header shows a three-icon segmented control (monitor / sun / moon) on a `surface-2` track; the active theme's icon sits on a raised `surface` pill.
- Hovering a segment shows a tooltip with `系统` / `亮色` / `暗色` (or the EN equivalents).
- Clicking each segment switches the theme; check in both light and dark mode (the active pill must stay legible in both).
- Keyboard focus on a segment shows the focus ring.
- Open the app sidebar user popover (any logged-in page) — the `主题` row shows the same control and does not overflow the `w-56` popover.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/theme-switcher.tsx DESIGN.md
git commit -m "$(cat <<'EOF'
Redesign ThemeSwitcher as an icon segmented control

The plain-text dot-separated buttons did not read as a control. Render
the three theme options as a Monitor/Sun/Moon segmented control on the
shared tabs-list track, each segment Tooltip-wrapped and aria-labelled.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: LanguageSwitcher → text segmented control, drop `compact`

Mirror Task 1 for `LanguageSwitcher`: two text segments (`EN` / `中文`) on the same segmented-control track. Remove the `compact` prop (and the `shortLabel` tuple element) — the segmented control is compact enough that the sidebar popover row no longer needs the abbreviated `中` label. The single `compact` call site (`shell.tsx`) is updated in the same task so the build never breaks.

**Files:**
- Modify (full rewrite): `frontend/src/components/language-switcher.tsx`
- Modify: `frontend/src/components/shell.tsx` (the `<LanguageSwitcher compact />` call site)
- Modify: `DESIGN.md` (the `LanguageSwitcher` row in the `### Composite / shared` table)

- [ ] **Step 1: Rewrite `frontend/src/components/language-switcher.tsx`**

Replace the entire file with:

```tsx
import type { Lang } from "@/lib/i18n";
import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const OPTIONS: ReadonlyArray<readonly [Lang, string]> = [
  ["en", "EN"],
  ["zh", "中文"],
];

export function LanguageSwitcher({ className }: { className?: string }) {
  const { lang, setLang } = useLang();
  return (
    <div
      className={cn(
        "inline-flex h-7 shrink-0 items-center rounded-md bg-surface-2 p-0.5",
        className,
      )}
      role="group"
      aria-label="Language"
    >
      {OPTIONS.map(([code, label]) => {
        const active = lang === code;
        return (
          <button
            key={code}
            type="button"
            onClick={() => setLang(code)}
            aria-pressed={active}
            className={cn(
              "inline-flex h-6 items-center justify-center whitespace-nowrap rounded-sm px-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              active
                ? "bg-surface text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
```

Notes:
- The `compact` prop and the `shortLabel` (third tuple element) are removed; `OPTIONS` is now `[Lang, string]`.
- The `Fragment` import and the `·` separators are gone.
- Active segment is `bg-surface text-foreground` (the `tab-active` token), matching `ThemeSwitcher`.

- [ ] **Step 2: Update the `compact` call site in `frontend/src/components/shell.tsx`**

Replace the exact string:

```
<LanguageSwitcher compact />
```

with:

```
<LanguageSwitcher />
```

(This is the only `compact` usage in the codebase. The other call sites — `landing.tsx` and `login.tsx` — already render `<LanguageSwitcher />` with no prop and need no change.)

- [ ] **Step 3: Update the `LanguageSwitcher` row in `DESIGN.md`**

In the `## Components` → `### Composite / shared` table, replace this exact row:

```
| `LanguageSwitcher` | `components/language-switcher.tsx` | The `EN / 中文` pill. Lives in shell footer and landing header. |
```

with:

```
| `LanguageSwitcher` | `components/language-switcher.tsx` | The `EN / 中文` language toggle — a two-segment segmented control (`bg-surface-2` track, active segment `bg-surface`). Lives in the sidebar user Popover, the landing header, and the login page. Takes only a `className` prop. |
```

- [ ] **Step 4: Verify the build passes**

Run: `cd frontend && npm run build`
Expected: PASS — `tsc -b` reports no errors. (If Step 2 were skipped, `tsc` would fail on `shell.tsx` because `compact` is no longer a valid prop — that is the intended guard.)

- [ ] **Step 5: Visual check in the browser**

With the dev server running:
- Landing header (`/`): the language switcher is a two-segment `EN` / `中文` control on a `surface-2` track; the active language sits on a `surface` pill. Clicking switches the language. It sits next to the theme switcher with clear separation between the two controls.
- Login page (`/login`): the language switcher in the top-right corner renders as the same segmented control.
- Sidebar user popover: the `语言` row shows `EN` / `中文` (full label, no longer abbreviated to `中`) and does not overflow the `w-56` popover.
- Check focus ring and hover state; check in both light and dark mode.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/language-switcher.tsx frontend/src/components/shell.tsx DESIGN.md
git commit -m "$(cat <<'EOF'
Redesign LanguageSwitcher as a segmented control, drop compact

Match ThemeSwitcher: render EN / 中文 as a two-segment segmented
control on the shared tabs-list track. The control is compact enough
that the sidebar popover no longer needs the abbreviated label, so the
compact prop and its single call site in shell.tsx are removed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Convert the hero proof strip to a 2×2 card grid

The hero proof strip in `landing.tsx` crams four points into four narrow columns; the `value` strings are rendered in `mono`, so CJK phrases wrap, and the `label` uses the near-invisible `text-faint`. Replace the bordered 4-column strip with a 2×2 grid of `ProofCard`s that match the existing `ModelCard` / `CapabilityCard` style on the same page. The `value` renders in the sans body font by default; only `/v1` (a path) keeps `mono`. The `label` moves to the readable `text-muted-foreground`.

**Files:**
- Modify: `frontend/src/pages/landing.tsx` (add `cn` import, add `ProofCard`, rewrite the `proofs` array, replace the proof strip render)

- [ ] **Step 1: Add the `cn` import to `frontend/src/pages/landing.tsx`**

Replace this exact pair of lines:

```tsx
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
```

with:

```tsx
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
```

- [ ] **Step 2: Add the `ProofCard` component**

`ProofCard` is a landing-page-local component, the same as `ModelCard` and `CapabilityCard` (it does not move to `components/`). Insert it just before `LandingPage`. Replace this exact block (the end of `CapabilityCard` and the start of `LandingPage`):

```tsx
}

export function LandingPage() {
```

with:

```tsx
}

function ProofCard({
  value,
  label,
  mono,
}: {
  value: string;
  label: string;
  mono?: boolean;
}) {
  return (
    <article className="rounded-md border border-border bg-surface p-4">
      <div className={cn("text-base font-semibold", mono && "mono")}>{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </article>
  );
}

export function LandingPage() {
```

- [ ] **Step 3: Rewrite the `proofs` array**

Replace this exact block:

```tsx
  const proofs = [
    t("landing.hero.proof.endpoint.value"),
    t("landing.hero.proof.modalities.value"),
    t("landing.hero.proof.caps.value"),
    t("landing.hero.proof.logs.value"),
  ].map((value, index) => ({
    value,
    label: [
      t("landing.hero.proof.endpoint.label"),
      t("landing.hero.proof.modalities.label"),
      t("landing.hero.proof.caps.label"),
      t("landing.hero.proof.logs.label"),
    ][index],
  }));
```

with:

```tsx
  const proofs = [
    { value: t("landing.hero.proof.endpoint.value"), label: t("landing.hero.proof.endpoint.label"), mono: true },
    { value: t("landing.hero.proof.modalities.value"), label: t("landing.hero.proof.modalities.label") },
    { value: t("landing.hero.proof.caps.value"), label: t("landing.hero.proof.caps.label") },
    { value: t("landing.hero.proof.logs.value"), label: t("landing.hero.proof.logs.label") },
  ];
```

Only the `endpoint` item (`/v1`) carries `mono: true` — `/v1` is a path. The other three values are CJK phrases and render in the sans body font.

- [ ] **Step 4: Replace the proof strip render**

Replace this exact block:

```tsx
              <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border-y border-border">
                {proofs.map(({ value, label }) => (
                  <div key={value} className="py-4 pr-4 border-b sm:border-b-0 sm:border-r border-border last:border-r-0">
                    <div className="text-base font-semibold mono">{value}</div>
                    <div className="mt-1 text-xs text-faint">{label}</div>
                  </div>
                ))}
              </div>
```

with:

```tsx
              <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {proofs.map((proof) => (
                  <ProofCard key={proof.value} {...proof} />
                ))}
              </div>
```

- [ ] **Step 5: Verify the build passes**

Run: `cd frontend && npm run build`
Expected: PASS — `tsc -b` reports no errors. The `proofs` array's inferred element type is a union (`{value, label, mono} | {value, label}`); spreading it into `ProofCard`'s `{ value, label, mono? }` props is type-safe because `mono` is optional.

- [ ] **Step 6: Visual check in the browser**

With the dev server running, open the landing page (`/`):
- Below the hero CTA buttons, the four proof points render as a 2×2 grid of bordered cards (`rounded-md border bg-surface p-4`), matching the model/capability cards lower on the page.
- `文本 / 图像 / 视频` stays on one line — no wrapping; all four cards are the same height.
- `/v1` renders in the monospace font; the other three values render in the sans body font.
- The label line (`OpenAI SDK 兼容入口`, etc.) is clearly readable (`text-muted-foreground`, not the old faint grey).
- Narrow the viewport (mobile width): the grid collapses to a single column.
- Check in both light and dark mode.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/landing.tsx
git commit -m "$(cat <<'EOF'
Convert landing hero proof strip to a 2x2 card grid

The four-column bordered strip crammed the proof points into ~130px
columns, rendered CJK values in mono (forcing wraps), and used the
near-invisible faint grey for labels. Render them as a 2x2 ProofCard
grid matching the page's other cards; sans values (mono only for /v1),
readable muted-foreground labels.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage:**
- Spec §3.1 segmented-control visual spec → Tasks 1 & 2 (shared `bg-surface-2` track, `h-7`, `bg-surface` active segment, `rounded-sm`, focus ring, no `·` separators). ✓
- Spec §3.2 ThemeSwitcher icons + tooltips + aria → Task 1. ✓
- Spec §3.3 LanguageSwitcher text segments, drop `compact`/`shortLabel` → Task 2. ✓
- Spec §3.4 landing header unchanged structure → no edit needed (Tasks 1 & 2 only swap the component internals; `landing.tsx:206-209` is untouched). ✓
- Spec §3.5 shell popover, `compact` removal → Task 2 Step 2. ✓
- Spec §4.1 grid layout change → Task 3 Step 4. ✓
- Spec §4.2 `ProofCard` component + `cn` import → Task 3 Steps 1–2. ✓
- Spec §4.3 `mono` flag on `/v1`, map render change → Task 3 Steps 3–4. ✓
- Spec §5 file list → Tasks 1–3 cover `theme-switcher.tsx`, `language-switcher.tsx`, `shell.tsx`, `landing.tsx`, `DESIGN.md`; `login.tsx` correctly needs no change. ✓
- Spec §6 DESIGN.md updates → Task 1 Step 2, Task 2 Step 3. ✓
- Spec §7 verification → each task's build + visual-check steps; the union of the three visual checks covers the spec's full checklist (landing header, light+dark, sidebar popover, login page, proof strip, mobile). ✓

**Placeholder scan:** No `TBD` / `TODO` / "add error handling" / vague steps. Every code step shows complete file content or an exact find-and-replace block. ✓

**Type consistency:** `ProofCard` props `{ value: string; label: string; mono?: boolean }` are consistent between Step 2 (definition) and Steps 3–4 (the `proofs` items and `{...proof}` spread). `OPTIONS` tuple shapes are consistent within each component (`[ThemePreference, TKey, LucideIcon]` in Task 1, `[Lang, string]` in Task 2). `Tooltip`'s `content`/`children` API matches `frontend/src/components/ui/tooltip.tsx`. ✓
