import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { panelSurface } from '@/lib/dashboard/frame'
import { MODAL_PANEL_CLASS } from '@/components/settings/modalChrome'

// ---------------------------------------------------------------------------
// Every pop-up is glass (R67 of 16-11-2026, "every pop-up"). The design system's own pop-ups are glass since Facet
// 0.25.7. These are the ones the APP draws itself: each takes the menus' surface (lib/dashboard/frame.tsx,
// `panelSurface`; styles/globals.css, `.glass-panel`) and names no fill of its own. A pop-up that keeps a solid
// fill reads as a different app beside the others, and nothing else fails when one is added that way.
//
// 🔴 Where the glass sits: on the element that FADES IN. A backdrop blur reads only what lies inside the nearest
// ancestor with an opacity under 1, so under a wrapper that is still fading it reaches the page only when the fade
// ends.
//
// 🔴 The two that stay SOLID: a pop-up that opens INSIDE a glass surface and hangs out of its box. A blur inside an
// element that has a backdrop filter of its own reaches that element's box and no further. Measured in Chrome 145
// on 17-11-2026 (Pulse/docs/data/17-11-2026-glass-own-popups/nested-overhang-probe.mjs, sharp stripes under a
// see-through list): inside the dialog's box the stripes are blurred away (contrast 6 of 255), under the part of
// the list below the dialog they stay sharp (62). With the dialog's glass on its ::before, as Facet's Modal has it,
// both are blurred (2 and 2). The funnel dialog's step suggestions and the filter builder's operator menu hang out
// of a surface that carries its glass on itself, so they keep the solid popover fill.
// ---------------------------------------------------------------------------

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

/** The pop-ups the app draws itself, and what each is. */
const POPUPS: Record<string, string> = {
  'components/ui/area-chart.tsx': "the chart's hover card",
  'components/ui/select.tsx': "the app's own dropdown list",
  'components/ui/dialog.tsx': 'the dialog (the funnel dialog, the command palette)',
  'components/ui/tooltip.tsx': "the slider's tooltip",
  'components/settings/SiteHeaderIdentity.tsx': "the settings header's site switcher",
  'components/settings/SettingsShell.tsx': "the phone's settings sheet",
  'components/settings/modalChrome.ts': 'the passkey and recovery dialogs',
  'components/dashboard/DashboardShell.tsx': "the top bar's site picker",
  'components/dashboard/Sidebar.tsx': "the phone's navigation drawer",
  'components/dashboard/filter/FilterPopover.tsx': 'the filter builder',
  'components/dashboard/filter/search/SearchFilter.tsx': 'the Filter menu',
  'components/dashboard/filter/search/FiltersBox.tsx': 'the filters on, and the menu that saves one',
  'components/dashboard/TabMenu.tsx': "a tab's menu",
  'components/dashboard/bottom/ConversionBlock.tsx': "the funnel chart's hover card",
  'components/onboarding/OnboardingChip.tsx': 'the getting-started list',
  'components/keyboard/ShortcutsOverlay.tsx': 'the keyboard shortcuts dialog',
  'components/ui/DateRangePicker.tsx': 'the date menu',
  'components/whats-new/WhatsNewButton.tsx': "the What's new panel",
  'components/VersionToast.tsx': 'the "update available" notice',
  'components/ui/navigation-menu.tsx': "the public header's dropdown (the sign-in and not-found pages)",
  'components/marketing/Header.tsx': "the public header's menu on a phone",
}

/** Pop-ups that open inside a glass surface, where a blur has nothing in reach: solid, and why is written at each. */
const INSIDE_GLASS: Record<string, string> = {
  'components/funnels/FunnelModal.tsx': "the funnel dialog's step suggestions, inside the dialog",
  'components/dashboard/filter/OperatorChip.tsx': "the filter builder's operator menu, inside the builder",
}

/** The fill that makes a pop-up solid again. */
const SOLID = /\bbg-popover\b/

describe('every pop-up the app draws itself is glass', () => {
  it.each(Object.entries(POPUPS))('%s (%s)', (file) => {
    const source = read(file)
    expect(/\bglass-panel\b|panelSurface\(/.test(source), `${file} must take the menus' glass surface`).toBe(true)
    expect(SOLID.test(source), `${file} must not name the solid popover fill`).toBe(false)
  })

  it.each(Object.entries(INSIDE_GLASS))('%s stays solid (%s), and says why where it does', (file) => {
    const source = read(file)
    expect(source).toMatch(/border border-border bg-popover|bg-popover border border-border/)
    expect(source).toContain('SOLID, on purpose')
    expect(source).toContain('popups-are-glass.test.ts')
  })

  it('the surface is one string, and the dialogs that share a class use it', () => {
    expect(panelSurface(true)).toBe('glass-panel border border-white/[0.08]')
    expect(MODAL_PANEL_CLASS).toContain('glass-panel border border-white/[0.08]')
    expect(MODAL_PANEL_CLASS).not.toMatch(/\bbg-card\b|\bborder-border\b|\bshadow-xl\b/)
  })

  it('no other file of the app draws a surface with the solid popover fill', () => {
    // Those that may: the surface's own solid branch (kept for a page that ever needs a solid panel) and the two
    // that open inside a glass surface. (The public header's menus were the last solid ones: glass since
    // 17-11-2026, as the marketing site's own header already was.)
    const allowed = new Set(['lib/dashboard/frame.tsx', ...Object.keys(INSIDE_GLASS)])
    const found: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(join(ROOT, dir))) {
        if (name === 'node_modules' || name === '__tests__' || name.startsWith('.')) continue
        const rel = join(dir, name)
        if (statSync(join(ROOT, rel)).isDirectory()) walk(rel)
        else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && SOLID.test(read(rel))) found.push(rel)
      }
    }
    for (const top of ['app', 'components', 'lib']) walk(top)
    expect(found.filter((f) => !allowed.has(f))).toEqual([])
  })
})

describe("the product tour's pop-up, which driver.js builds and the stylesheet dresses", () => {
  const css = read('styles/globals.css')
  const rule = css.match(/\n\.driver-popover\.pulse-tour \{\n([^}]*)\}/)?.[1] ?? ''

  it('has the menus\' glass, to the value', () => {
    expect(rule).toContain('background: rgb(var(--popover) / var(--glass-panel));')
    expect(rule).toContain('backdrop-filter: blur(40px) saturate(1.5);')
    expect(rule).toContain('-webkit-backdrop-filter: blur(40px) saturate(1.5);')
    expect(rule).toContain('border: 1px solid rgb(var(--white) / 0.08);')
    // The same numbers as the menus' rule, so the two cannot drift apart unseen.
    const menus = css.match(/\n  \.glass-panel,[^{]*\{\n([^}]*)\}/)?.[1] ?? ''
    expect(menus).toContain('background-color: rgb(var(--popover) / var(--glass-panel));')
    expect(menus).toContain('backdrop-filter: blur(40px) saturate(1.5);')
  })
})

describe("the phone's settings sheet", () => {
  const source = read('components/settings/SettingsShell.tsx')

  it('keeps its title row out of the rows\' way without a fill of its own', () => {
    // On a see-through sheet a sticky title row would need a fill, which would be a second blur over the first: the
    // rows scroll in a box of their own under the row instead.
    expect(source).toContain('flex max-h-[80vh] flex-col overflow-hidden rounded-none glass-panel border-t border-white/[0.08]')
    expect(source).toContain('data-testid="settings-sheet-rows"')
    expect(source).toMatch(/className="min-h-0 flex-1 overflow-auto" data-testid="settings-sheet-rows"/)
    expect(source).not.toMatch(/sticky top-0[^"]*bg-card/)
  })
})
