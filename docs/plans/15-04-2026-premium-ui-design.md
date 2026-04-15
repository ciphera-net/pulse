# Premium UI Design Pass — Making Pulse Feel Apple-Quality

**Status:** Design — ready for staged implementation
**Owner:** Pulse frontend
**Date:** 15 April 2026
**Scope:** Logged-in application surfaces (dashboard, sites, settings, integrations, modals). Marketing pages and command palette (⌘K) are out of scope for this pass.

---

## Summary

Pulse's **static** design has now caught up to Apple-tier — elevated panels, grain-free neutral tones, brand-accent discipline, press feedback on interactive surfaces. The remaining gap is **temporal**: how surfaces behave over time, across frames, and between routes.

This plan converts Pulse from "well-styled at rest" to "feels alive" through eight coordinated pillars. Each pillar is independently shippable and ordered from foundational (must ship first) to polish.

---

## Current State Baselines (audit 2026-04-15)

These are the factual gaps we're closing. Every number below is a grep-verified count.

### Motion
| Metric | Value |
|---|---|
| Unique `duration-*` values in use | 5 (`150`, `200`, `300`, `500`, `100`) |
| Most common | `duration-200` (45), `duration-300` (22), `duration-150` (14) |
| `transition-all` call sites | **97** (heavy — triggers full property recalc every frame) |
| Hardcoded `cubic-bezier(...)` strings | 2 (`area-chart.tsx`, `Sidebar.tsx`) |
| Framer-motion spring configs | Inconsistent — `500/35` (Chart), `300/25` (bar-chart) |
| Shared motion tokens | None |

### Glass / Backdrop-blur
| Value | Count | Role |
|---|---|---|
| `backdrop-blur-sm` | 14 | Cards, surfaces (emerging tier 1) |
| `backdrop-blur-3xl` | 11 | Modals, flyouts, dropdowns (emerging tier 2) |
| `backdrop-blur-xl` | 5 | Inconsistent — mobile sticky bar, marketing |
| `backdrop-blur-md` | 2 | Chart tooltips |
| `backdrop-blur-lg` | 1 | Orphan |

Two tiers are emerging organically but undocumented; three orphan values exist.

### Typography
- No type-scale token file anywhere in the repo.
- Heading sizes are ad-hoc Tailwind classes (`text-xl` through `text-6xl` across pages).
- `tabular-nums` coverage is correct on 9 chart/metric components but **missing on `RealtimeVisitors.tsx` live count** (digits jitter on change).

### Interactive states (rest / hover / active / focus-visible / disabled)
| Component | Coverage |
|---|---|
| `button-1.tsx`, `button-website.tsx` | 5/5 ✓ |
| Sidebar nav links | 4/5 (no `active:`) |
| Dashboard list rows | 2/5 (hover-only) |
| `Card` component | 1/5 (rest only) |
| `navigation-menu.tsx` | Uses `focus:` instead of `focus-visible:` (triggers on mouse click too) |

### Empty states & loading
- Skeletons: 14+ page-level components in `components/skeletons.tsx` — well-structured, full coverage.
- Empty states: **zero reusable components**. 8+ inline `<p>No data</p>` fallbacks with inconsistent copy.

---

## Design Principles

Three principles govern every change below:

1. **Consistency over novelty.** One motion curve, one spring, one type scale — applied everywhere. Apple's premium feel is 90% *nothing surprising*.
2. **Chrome serves content.** Every chrome refinement must make the content more readable, not less. If a detail competes with a chart or a number, remove the detail.
3. **Temporal coherence.** Every interactive surface acknowledges the user within 150ms. Every route change transitions rather than cuts. Every data update animates.

---

## Pillar 1 — Unified Motion System

### Problem
Three competing durations, two inconsistent spring configs, two hardcoded cubic-beziers, no shared easing utility. Each framer-motion call site picks its own values.

### Target
- **Single easing**: `cubic-bezier(0.32, 0.72, 0, 1)` (iOS-standard) — exposed as `--ease-apple`
- **Duration scale**: `--duration-fast: 150ms` / `--duration-base: 250ms` / `--duration-slow: 400ms` / `--duration-gentle: 600ms`
- **Single Framer Motion spring**: `{ type: 'spring', stiffness: 400, damping: 35 }`
- **Single Framer Motion timing**: `{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }`

### Plan
1. Add CSS custom properties (`--ease-apple`, `--duration-*`) to `styles/globals.css`.
2. Extend `tailwind.config.ts`:
   - `transitionTimingFunction: { apple: 'var(--ease-apple)' }`
   - `transitionDuration: { fast: '150ms', base: '250ms', slow: '400ms', gentle: '600ms' }`
3. Create `lib/motion.ts` exporting `SPRING`, `EASE_APPLE`, and `DURATION_*` constants for Framer Motion consumers.
4. **Mechanical refactor pass** (subagent-driven):
   - Replace `transition-all` where a narrower property fits (`transition-colors`, `transition-transform`, etc.) — target ~60 of the 97 sites.
   - Add `ease-apple` class to every `transition-*` without explicit easing.
   - Map existing `duration-200`/`300` to `duration-base`/`duration-slow`.
   - Replace hardcoded `cubic-bezier(...)` in `area-chart.tsx` and `Sidebar.tsx` with `var(--ease-apple)`.
5. **Framer Motion pass**: update `DashboardShell`, `GoalStats`, `Chart`, `PeakHours`, `UnifiedSettingsModal`, `area-chart`, `bar-chart`, `funnel-chart` to import shared constants from `lib/motion.ts`.

### Files affected
~40 files across `components/` and `app/`. Fully mechanical; well-suited for subagent batches.

### Success criteria
- Grep for `cubic-bezier` returns only `globals.css`.
- Grep for `duration-200|duration-300` returns zero matches (all migrated to `duration-base`/`duration-slow`).
- Every framer-motion `transition={...}` config uses `SPRING` or `EASE_APPLE`.

---

## Pillar 2 — Glass Material Tiers

### Problem
Five different `backdrop-blur-*` values used without documented semantic roles. `md` and `lg` appear with no pattern.

### Target
Formalize two semantic tiers as utility classes:

| Tier | Class | Composition | Used for |
|---|---|---|---|
| Surface | `.glass-surface` | `bg-neutral-900/80 backdrop-blur-sm border border-white/[0.08]` | Cards, inline panels, widgets |
| Overlay | `.glass-overlay` | `bg-neutral-900/60 backdrop-blur-2xl backdrop-saturate-150 border border-white/[0.08]` | Modals, dropdowns, flyouts, tooltips |

Drop orphan `blur-md`, `blur-lg`, `blur-xl` except where a specific experiment documents its own reason.

### Plan
1. Add the two utility classes to `globals.css` under `@layer components`.
2. Refactor the 32 `backdrop-blur-*` call sites to use one of the two tiers.
3. Chart tooltips migrate from `blur-md` to `.glass-overlay`.

### Files affected
~20 files across `components/`. Mechanical.

### Success criteria
`grep "backdrop-blur-"` returns only the two utility definitions and any documented experiments.

---

## Pillar 3 — Page Transitions

### Problem
Next.js App Router hard-swaps routes. Clicking a site, switching settings tabs, opening an integration — each feels like a refresh.

### Target
Every route change fades + slides in over 250ms: opacity `0 → 1`, translateY `4px → 0`, with `--ease-apple`.

### Plan
1. Create `app/template.tsx` wrapping children with CSS-only animation (via the already-installed `tailwindcss-animate` plugin):
   ```
   <div className="animate-in fade-in slide-in-from-bottom-1 duration-base ease-apple">
     {children}
   </div>
   ```
2. Exclude `/auth/callback` — the OAuth redirect flow needs an immediate route swap.
3. Measurement: Lighthouse TBT before and after; target no regression.

### Risk
App Router `template.tsx` re-mounts on every navigation — heavier than `layout.tsx`. Mitigation: CSS-only animation (no Framer Motion on route boundary) keeps the overhead < 5ms per transition.

### Files affected
1 new file: `app/template.tsx`.

### Success criteria
Manual QA: navigate between sites, between tabs, between integrations — no jarring swap. Lighthouse TBT unchanged within ±20ms.

---

## Pillar 4 — Typography Tokens

### Problem
No type-scale exists in the codebase. Heading sizes are ad-hoc. `RealtimeVisitors` live count jitters on digit changes (missing `tabular-nums`).

### Target — 7-step scale

| Token | Size / line-height / tracking | Usage |
|---|---|---|
| `display-lg` | 48px / 1.05 / -0.02em | Landing hero numbers only |
| `display` | 36px / 1.1 / -0.015em | KPI primary values |
| `title-1` | 24px / 1.2 / -0.01em | Page titles |
| `title-2` | 18px / 1.3 / -0.005em | Card titles, widget headers |
| `title-3` | 14px / 1.4 / 0 | Subtitles, emphasized body |
| `body` | 14px / 1.5 / 0 | Default body text |
| `caption` | 12px / 1.4 / 0 | Meta text, captions |
| `micro-label` | 11px / 1 / 0.06em uppercase | Category rails ("ANALYTICS", "INFRASTRUCTURE") |

### Plan
1. Extend `tailwind.config.ts` with matching `fontSize` theme entries keyed to the tokens above.
2. Add `tabular-nums` to `RealtimeVisitors.tsx` live count — one-line fix.
3. Audit the four most-visible pages first (Dashboard, Journeys, Behavior, Sites home) — apply the scale consistently.
4. Iterate into remaining pages over follow-on passes.

### Files affected
`tailwind.config.ts`, `RealtimeVisitors.tsx`, ~20 pages/components progressively.

### Success criteria
Every heading in the dashboard uses a scale token. No `text-3xl font-bold` or similar ad-hoc classes on headings.

---

## Pillar 5 — Interactive State Consistency

### Problem
`Card` component defines zero interactive states. Dashboard list rows have hover but no `active:` or `focus-visible:`. `navigation-menu.tsx` uses `focus:` (wrong variant — triggers on mouse click too).

### Target
Every interactive surface defines all 5 states: rest / hover / active / focus-visible / disabled.

### Plan
1. Add an `interactive` variant to `Card` with:
   `hover:border-white/[0.12] hover:-translate-y-0.5 active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-ring transition-all duration-base ease-apple cursor-pointer`
   (opt-in via `variant="interactive"`, not default — avoids breaking info-only cards).
2. Create a `.interactive-row` utility for list rows:
   `hover:bg-white/[0.03] active:bg-white/[0.05] focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset transition-colors duration-fast ease-apple`
3. Replace `focus:` with `focus-visible:` in `navigation-menu.tsx`.
4. Apply `.interactive-row` to TopReferrers, Campaigns, Locations, GoalStats list items.

### Files affected
`components/ui/card.tsx`, `components/ui/navigation-menu.tsx`, four dashboard components.

### Success criteria
Keyboard-only navigation (Tab) highlights every interactive surface with brand-orange. Mouse click acknowledges via scale snap.

---

## Pillar 6 — Reusable Empty State Component

### Problem
Zero reusable empty-state components. 8+ inline `"No data"` fallbacks with inconsistent copy. Empty states are often a user's first impression of a feature — critical surface, currently neglected.

### Target
Single `<EmptyState>` component with consistent visual + tonal template.

### Component signature
```
<EmptyState
  icon={<ChartIcon />}
  title="No visitors yet"
  description="Share your site or embed the tracking snippet — your data will flow in here."
  action={{ label: 'View install guide', href: '/integrations' }}
/>
```

### Design
- Centered icon (64px) in a rounded-xl accent-tinted chip
- `title-2` token for title, `body` for description, `caption` for optional hint
- Optional action rendered as a primary button
- Vertical centering within parent, generous padding

### Tonal guide
- **Warm, specific, actionable** — never just "No data"
- Speak to what's missing and what the user can do
- One sentence max for description

### Plan
1. Create `components/ui/EmptyState.tsx`
2. Write tonal guide inline as a JSDoc comment on the component
3. Replace all 8 inline fallbacks in a single pass
4. Add to the list as new pages ship

### Files affected
1 new component, ~10 call sites in the initial pass.

### Success criteria
Zero inline "No X" strings remain in `components/dashboard/` and `app/`.

---

## Pillar 7 — Chart Refinement

### Problem
Charts work but are static — no hover tooltip glow, no initial line-draw animation. `area-chart.tsx` has a hardcoded `cubic-bezier(0.85, 0, 0.15, 1)` that conflicts with Pillar 1.

### Target
- Line draw-in animation on initial mount (400ms, shared spring from `lib/motion.ts`)
- Hover: crosshair with soft brand-orange glow (30% alpha, 16px blur via `drop-shadow`)
- Tooltip wrapper uses `.glass-overlay` (unifies with Pillar 2)
- Area gradient: brand-orange 25% → transparent (already in place, verify)

### Plan
1. `area-chart.tsx`: swap hardcoded `cubic-bezier(0.85, 0, 0.15, 1)` for `var(--ease-apple)`.
2. Add mount-animation via Framer Motion `initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}` using shared `SPRING`.
3. Tooltip wrappers: swap `backdrop-blur-md` for `.glass-overlay`.
4. Hover crosshair: `drop-shadow-[0_0_12px_rgba(253,94,15,0.3)]` on hover state.

### Files affected
`area-chart.tsx`, `bar-chart.tsx`, `funnel-chart.tsx`, `line-charts-6.tsx`, `Chart.tsx`.

### Success criteria
Charts animate on mount. Hover reads as responsive. No hardcoded easings remain in chart files.

---

## Pillar 8 — Micro-detail Polish Checklist

Small fixes that compound. Each is independently verifiable.

- [ ] `tabular-nums` on `RealtimeVisitors.tsx` live count
- [ ] Replace `focus:` with `focus-visible:` in `navigation-menu.tsx`
- [ ] Baseline-align icon + text on dashboard list rows (`leading-none` where appropriate)
- [ ] Verify every scrollable area uses the custom scrollbar from `globals.css` (sidebar, modal bodies, long tables)
- [ ] Rounded-corner consistency: `rounded-2xl` on outer cards, `rounded-xl` on nested, `rounded-lg` on chips/pills
- [ ] Contrast audit: AA minimum on body text against `bg-neutral-900/80`
- [ ] Replace every `transition-all` with narrower property transitions (97 sites — tackled in Pillar 1)

### Success criteria
Every item checked; grep/axe passes for each.

---

## Implementation Phases

Each phase is independently reviewable and shippable. Estimated effort assumes subagent-driven mechanical refactors.

### Phase 1 — Motion foundations (P1) — **ship first**
Tokens, CSS vars, Tailwind config, `lib/motion.ts`, plus mechanical refactor of ~40 framer-motion and Tailwind call sites.
Every later phase builds on these tokens.
**Effort:** ~1 day with subagent batches + QA per chunk.

### Phase 2 — Glass tiers (P2) + Chart refinements (P7)
Paired because both touch `backdrop-blur`. Chart tooltips benefit from the new `.glass-overlay` utility.
**Effort:** ~4 hours.

### Phase 3 — Page transitions (P3)
Single new `app/template.tsx`. Immediately visible — navigation feels smoother instantly.
**Effort:** ~30 min + Lighthouse verification.

### Phase 4 — Typography tokens (P4) + Micro-detail polish (P8)
Tokens plus one-line fixes (`tabular-nums` on `RealtimeVisitors`, `focus-visible` in `navigation-menu`, etc.). Apply scale to top 4 dashboard pages; iterate into the rest over time.
**Effort:** ~4 hours for tokens + top pages; ongoing for full coverage.

### Phase 5 — Interactive states (P5) + Empty states (P6)
Create the shared `interactive-row` utility + `<EmptyState>` component. Refactor 8+ inline empty states. Apply interactive states across list rows.
**Effort:** ~4 hours.

**Total estimated:** ~2-3 days of focused work, spread over several commits.

---

## Risks & Tradeoffs

- **Phase 1 refactor risk**: 40 files touched mechanically. Mitigation: subagent-driven batches with `tsc --noEmit` + manual staging QA after each chunk (dashboard → settings → modals). No feature flag possible since changes are visual-only; rely on staging review.
- **Phase 3 render cost**: `template.tsx` re-mounts on every navigation. Mitigation: CSS-only transition (no Framer Motion on route boundaries) keeps overhead < 5ms. Measurement: Lighthouse TBT before/after.
- **Over-polish**: every additional detail eventually becomes noise. **Hard stop after Phase 5**; re-evaluate before adding a 9th pillar.
- **Token sprawl**: ~12 new CSS vars + ~5 Tailwind tokens + two new `lib/` files. Worth it for consistency; schedule a token audit in 6 months.

---

## Out of Scope

- ⌘K command palette (deferred by user)
- Sound / haptic feedback (web-inappropriate)
- Dark-mode theming (Pulse is dark-only)
- Marketing page refinements
- Shannon, Auth, Website app polish (separate initiative)
- Squircle corners (would require SVG masks; stock `rounded-*` is sufficient)
- Keyboard shortcuts beyond existing ones (deferred with ⌘K)

---

## Overall Success Criteria

1. One easing curve + one duration scale used across all of Pulse frontend (grep-verifiable).
2. Two documented glass tiers cover every `backdrop-blur-*` usage.
3. Route transitions complete within 300ms, no Lighthouse TBT regression.
4. Zero inline empty states across `app/` and `components/dashboard/`.
5. Subjective: hand the staging URL to three first-time viewers — target unanimous "this feels premium" from 3/3.

---

## Appendix — Motion Token Reference

For quick reference during implementation. Copy into `lib/motion.ts`:

```ts
// Easing — iOS-standard spring-like curve
export const EASE_APPLE = [0.32, 0.72, 0, 1] as const

// Duration scale (seconds, for framer-motion)
export const DURATION_FAST = 0.15
export const DURATION_BASE = 0.25
export const DURATION_SLOW = 0.4
export const DURATION_GENTLE = 0.6

// Shared spring — use for any element with physical "weight" (modals, panels, handles)
export const SPRING = { type: 'spring' as const, stiffness: 400, damping: 35 }

// Shared timing — use for opacity/color tweens
export const TIMING = { duration: DURATION_BASE, ease: EASE_APPLE } as const
```

And in `styles/globals.css`:

```css
:root {
  --ease-apple: cubic-bezier(0.32, 0.72, 0, 1);
  --duration-fast: 150ms;
  --duration-base: 250ms;
  --duration-slow: 400ms;
  --duration-gentle: 600ms;
}
```

And in `tailwind.config.ts` under `theme.extend`:

```ts
transitionTimingFunction: {
  apple: 'var(--ease-apple)',
},
transitionDuration: {
  fast: '150ms',
  base: '250ms',
  slow: '400ms',
  gentle: '600ms',
},
```
