import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { DimensionInfoTip, INFO_TIP_GLYPH_CLASS, INFO_TIP_PANEL_CLASS, MetricInfoTip, TermInfoTip } from '@/components/dashboard/MetricInfoTip'
import { CompactNumber } from '@/components/ui/compact-number'
import * as names from '@/lib/ui/popupSurface'

// The info pop-up: glass, as a menu of the dashboard is, on EVERY page, for every reader (since 15-11-2026; it was
// the new dashboard's beta look until that evening).
//
// Three things make "every page" true, and each is pinned here:
//   - one file of the app draws facet's InfoTip, so there is one place to say what its panel is;
//   - that file gives every panel one class;
//   - the stylesheet turns that class into glass, with the menus' own declaration, behind `html:root`: it matches
//     every page and weighs enough to beat facet's solid fill (one utility class, later in the sheet).

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

describe('every info pop-up of the app carries the panel class', () => {
  const open = () => {
    fireEvent.click(screen.getByRole('button'))
    return screen.getByRole('dialog')
  }

  it('a metric\'s', () => {
    render(<MetricInfoTip metric="visitors" />)
    expect(open().classList.contains(INFO_TIP_PANEL_CLASS)).toBe(true)
  })

  it('a term\'s and a block\'s tab\'s', () => {
    const term = render(<TermInfoTip term="outbound_links" />)
    expect(open().classList.contains(INFO_TIP_PANEL_CLASS)).toBe(true)
    term.unmount()
    render(<DimensionInfoTip tab="outbound" />)
    expect(open().classList.contains(INFO_TIP_PANEL_CLASS)).toBe(true)
  })

  it('on the PANEL, and the icon keeps its own classes: a placement class never reaches the panel', () => {
    render(<TermInfoTip term="outbound_links" className="ms-2 me-auto" />)
    const glyph = screen.getByRole('button')
    expect(glyph.classList.contains('ms-2')).toBe(true)
    expect(glyph.classList.contains(INFO_TIP_PANEL_CLASS)).toBe(false)
    fireEvent.click(glyph)
    const panel = screen.getByRole('dialog')
    expect(panel.classList.contains('ms-2')).toBe(false)
    // Facet's own panel is still there under it. Since facet 0.25.7 that panel is glass too, dark in every theme
    // (`facet-glass-dark`), and has no fill utility left for the app's class to fight.
    expect(panel.classList.contains('facet-glass-dark')).toBe(true)
    expect(panel.className).not.toMatch(/\bbg-neutral-900\b/)
  })

  it('is the class the stylesheet names', () => {
    expect(INFO_TIP_PANEL_CLASS).toBe('info-tip-panel')
    expect(read('styles/globals.css')).toContain(`.${INFO_TIP_PANEL_CLASS}`)
  })
})

describe('one file of the app draws facet\'s InfoTip', () => {
  it('components/dashboard/MetricInfoTip.tsx, and nothing else', () => {
    // A second file drawing it would be a pop-up the class never reaches: solid among glass ones.
    const importers: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name === '__tests__' || name.startsWith('.')) continue
        const path = join(dir, name)
        if (statSync(path).isDirectory()) walk(path)
        else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
          const source = readFileSync(path, 'utf8')
          // Any import from facet that names InfoTip, on one line or over several.
          for (const statement of source.match(/import\s*(?:type\s*)?\{[^}]*\}\s*from\s*'@ciphera-net\/facet'/g) ?? []) {
            if (/[{,\s]InfoTip[\s,}]/.test(statement)) importers.push(path.slice(process.cwd().length + 1))
          }
        }
      }
    }
    for (const root of ['app', 'components', 'lib', 'hooks']) walk(join(process.cwd(), root))
    expect(importers).toEqual(['components/dashboard/MetricInfoTip.tsx'])
  })
})

describe('the stylesheet makes the panel glass on every page', () => {
  const css = read('styles/globals.css')

  it('with the menus\' own declaration: one rule for the menu, the pop-up and the small tooltip, so they cannot drift', () => {
    const shared = css.match(/\n  \.glass-panel,\n  html:root \.info-tip-panel,\n  html:root \.tooltip-panel \{\n([^}]*)\}/)
    expect(shared).not.toBeNull()
    const body = shared?.[1] ?? ''
    expect(body).toContain('background-color: rgb(var(--popover) / var(--glass-panel));')
    expect(body).toContain('backdrop-filter: blur(40px) saturate(1.5);')
    expect(body).toContain('-webkit-backdrop-filter: blur(40px) saturate(1.5);')
    // No second, separate definition of the menus' glass anywhere.
    expect(css.match(/\.glass-panel\b[^{]*\{/g)).toHaveLength(1)
  })

  it('every rule that names the panel starts with `html:root`, the weight that beats facet\'s solid panel', () => {
    const selectors = css.match(/^[^\n{}]*\.info-tip-panel\b[^\n{}]*[{,]/gm) ?? []
    // The shared rule, the panel's own, and the four parts of Header.
    expect(selectors.length).toBeGreaterThanOrEqual(6)
    for (const selector of selectors) expect(selector, selector).toContain('html:root .info-tip-panel')
  })

  it('gives it the frame\'s hairline, a menu\'s shadow, no ring and no padding of its own', () => {
    // The panel's own rule (in the rule it shares with the menus it is not the last selector).
    const rules = [...css.matchAll(/\n  html:root \.info-tip-panel \{\n([^}]*)\}/g)]
    expect(rules).toHaveLength(1)
    const body = rules[0][1]
    // Header: the strips bring their own padding.
    expect(body).toContain('padding: 0;')
    // The ink at 8%, as lib/dashboard/frame.tsx gives a menu (border-white/[0.08]).
    expect(body).toContain('border-color: rgb(var(--white) / 0.08);')
    // Tailwind's shadow-lg to the value, which the menus carry as a class.
    expect(body).toContain('box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);')
    expect(body).toContain('outline: none;')
  })

  it('and a menu still gets its hairline from the frame, the same ink', async () => {
    const { panelSurface } = await import('@/lib/dashboard/frame')
    expect(panelSurface(true)).toBe('glass-panel border border-white/[0.08]')
  })

  it('a facet tooltip or info pop-up the app has not marked takes the theme\'s fill and hairline too', () => {
    // Facet 0.25.7 draws those two dark in every theme. Pulse's greys follow the theme, so on the light page an
    // unmarked one would be a dark panel under dark text: one rule, on facet's own class, with the marked ones' values.
    const rules = [...css.matchAll(/\n  html:root \.facet-glass-dark \{\n([^}]*)\}/g)]
    expect(rules).toHaveLength(1)
    const body = rules[0][1]
    expect(body).toContain('background-color: rgb(var(--popover) / var(--glass-panel));')
    expect(body).toContain('border-color: rgb(var(--white) / 0.08);')
    // The blur and the shadow stay facet's own (the same values as the menus'), so the rule names neither.
    expect(body).not.toContain('backdrop-filter')
    expect(body).not.toContain('box-shadow')
  })
})

describe('the pop-up\'s shape is Header: the name, the sentence, the link, each in its own strip', () => {
  const css = read('styles/globals.css')
  const rule = (selector: string) => {
    const at = css.indexOf(`\n  html:root .info-tip-panel > ${selector} {\n`)
    expect(at, selector).toBeGreaterThan(-1)
    return css.slice(at, css.indexOf('}', at))
  }

  it('lays out the four parts facet draws, by the stylesheet alone', () => {
    const HAIRLINE = '1px solid rgb(var(--white) / 0.08)'
    // The name: a strip of its own, ruled off below.
    expect(rule('.font-semibold')).toContain('padding: 8px 12px;')
    expect(rule('.font-semibold')).toContain(`border-bottom: ${HAIRLINE};`)
    expect(rule('.font-semibold')).toContain('margin: 0;')
    // The sentence.
    expect(rule('div:not([class])')).toContain('padding: 10px 12px;')
    // An example, where a metric has one: inside the sentence's margins, under it.
    expect(rule('div.border')).toContain('margin: 0 12px 10px;')
    // The link: a strip at the foot, ruled off above, at its right end.
    expect(rule('a')).toContain('padding: 8px 12px;')
    expect(rule('a')).toContain(`border-top: ${HAIRLINE};`)
    expect(rule('a')).toContain('justify-content: flex-end;')
    expect(rule('a')).toContain('margin: 0;')
  })

  it('and every one of those rules still finds its part in the REAL component', () => {
    // The rules name parts of facet's own markup. A facet update that renames or moves one would leave the
    // pop-up half laid out and every other test green: this renders the real thing and counts.
    render(<MetricInfoTip metric="bounce_rate" example={<>41% of 1,200 visits</>} />)
    fireEvent.click(screen.getByRole('button'))
    const panel = screen.getByRole('dialog')
    const parts = [...panel.children]
    const matching = (selector: string) => parts.filter((el) => el.matches(selector))
    const name = matching('.font-semibold')
    const sentence = matching('div:not([class])')
    const example = matching('div.border')
    const link = matching('a')
    expect(name).toHaveLength(1)
    expect(sentence).toHaveLength(1)
    expect(example).toHaveLength(1)
    expect(link).toHaveLength(1)
    // Those four are all of it, in that order, and no part is matched by two rules.
    expect(parts).toEqual([name[0], sentence[0], example[0], link[0]])
    expect(name[0].textContent).toBe('Bounce rate')
    expect(example[0].textContent).toBe('41% of 1,200 visits')
    expect(link[0].textContent).toContain('Learn more')
    // The link is a row whose content the rule pushes to the right: it must be a flex row for that to mean anything.
    expect(link[0].classList.contains('flex')).toBe(true)
  })

  it('a pop-up with no example is laid out by the same rules, and none of its parts is left out of them', () => {
    render(<TermInfoTip term="outbound_links" />)
    fireEvent.click(screen.getByRole('button'))
    const parts = [...screen.getByRole('dialog').children]
    expect(parts.filter((el) => el.matches('.font-semibold'))).toHaveLength(1)
    expect(parts.filter((el) => el.matches('div:not([class])'))).toHaveLength(1)
    expect(parts.filter((el) => el.matches('div.border'))).toHaveLength(0)
    // Every part is one the rules know: nothing in the panel is left with no padding at all.
    for (const el of parts) expect(el.matches('.font-semibold, div:not([class]), div.border, a'), el.outerHTML.slice(0, 80)).toBe(true)
  })
})

describe('the info icon is a fine circle, drawn by the stylesheet', () => {
  const css = read('styles/globals.css')

  it('every info icon carries the icon\'s class, before the class that places it', () => {
    const metric = render(<MetricInfoTip metric="visitors" className="ms-2" />)
    expect(screen.getByRole('button').className).toContain(`${INFO_TIP_GLYPH_CLASS} ms-2`)
    metric.unmount()
    const term = render(<TermInfoTip term="outbound_links" />)
    expect(screen.getByRole('button').classList.contains(INFO_TIP_GLYPH_CLASS)).toBe(true)
    // No stray "undefined" where the caller places nothing.
    expect(screen.getByRole('button').className).not.toContain('undefined')
    term.unmount()
    render(<DimensionInfoTip tab="outbound" className="ms-2 me-auto" />)
    expect(screen.getByRole('button').className).toContain(`${INFO_TIP_GLYPH_CLASS} ms-2 me-auto`)
  })

  it('is on the ICON and never on the panel', () => {
    render(<TermInfoTip term="outbound_links" />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('dialog').classList.contains(INFO_TIP_GLYPH_CLASS)).toBe(false)
  })

  it('facet\'s own icon is the button\'s one direct svg: that is what the stylesheet hides', () => {
    render(<TermInfoTip term="outbound_links" />)
    const glyph = screen.getByRole('button')
    expect([...glyph.children].map((el) => el.tagName.toLowerCase())).toEqual(['svg'])
    expect(css).toMatch(/\n  html:root \.info-tip-glyph > svg \{\n    display: none;\n  \}/)
  })

  it('draws a 16 px mask over the button\'s own colour, so facet\'s rest, hover, focus and open still colour it', () => {
    const at = css.indexOf('\n  html:root .info-tip-glyph::before {\n')
    expect(at).toBeGreaterThan(-1)
    const body = css.slice(at, css.indexOf('}', at))
    expect(body).toContain("content: '';")
    expect(body).toContain('width: 16px;')
    expect(body).toContain('height: 16px;')
    expect(body).toContain('background-color: currentColor;')
    expect(body).toContain('mask: var(--info-glyph) center / contain no-repeat;')
    expect(body).toContain('-webkit-mask: var(--info-glyph) center / contain no-repeat;')
    // No colour of its own anywhere in the icon's rules: a colour here would freeze it gray under the pointer.
    const rules = css.match(/html:root \.info-tip-glyph[^{]*\{[^}]*\}/g) ?? []
    expect(rules).toHaveLength(3)
    for (const r of rules) expect(r.replace(/--info-glyph:[^;]*;/, ''), r.slice(0, 60)).not.toMatch(/(^|[\s;{])color:/)
  })

  it('the drawing is the one that was picked: a fine circle, a dot and a stem', () => {
    const uri = css.match(/--info-glyph: url\("data:image\/svg\+xml,([^"]+)"\);/)?.[1]
    expect(uri).toBeTruthy()
    const svg = decodeURIComponent(uri as string)
    expect(svg).toBe(
      "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'>" +
        "<circle cx='8' cy='8' r='6.5' fill='none' stroke='black' stroke-width='1'/>" +
        "<circle cx='8' cy='5.1' r='0.85'/>" +
        "<rect x='7.4' y='7' width='1.2' height='4.3'/>" +
        '</svg>',
    )
    // The stylesheet stays ASCII (the address is percent-encoded).
    expect(/^[\x20-\x7e]+$/.test(uri as string)).toBe(true)
  })

  it('every rule of the icon names the look\'s class: without it the icon is facet\'s bold one', () => {
    const selectors = css.match(/^[^\n{}]*\.info-tip-glyph\b[^\n{}]*\{/gm) ?? []
    expect(selectors).toHaveLength(3)
    for (const selector of selectors) expect(selector, selector).toContain('html:root .info-tip-glyph')
  })
})

describe('the small tooltip is glass too, wherever the app draws one', () => {
  const css = read('styles/globals.css')

  it('takes the menus\' declaration as a third selector, and the pop-up\'s hairline and shadow', () => {
    expect(css).toMatch(/\n  \.glass-panel,\n  html:root \.info-tip-panel,\n  html:root \.tooltip-panel \{\n/)
    const at = css.indexOf('\n  html:root .tooltip-panel {\n    border-color')
    expect(at).toBeGreaterThan(-1)
    const body = css.slice(at, css.indexOf('}', at))
    expect(body).toContain('border-color: rgb(var(--white) / 0.08);')
    expect(body).toContain('box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);')
  })

  it('every file that draws facet\'s Tooltip marks its panel', () => {
    const drawers: string[] = []
    const unmarked: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name === '__tests__' || name.startsWith('.')) continue
        const path = join(dir, name)
        if (statSync(path).isDirectory()) walk(path)
        else if (/\.tsx$/.test(name) && !/\.test\.tsx$/.test(name)) {
          const source = readFileSync(path, 'utf8')
          const imports = (source.match(/import\s*\{[^}]*\}\s*from\s*'@ciphera-net\/facet'/g) ?? []).some((statement) => /[{,\s]Tooltip[\s,}]/.test(statement))
          if (!imports) continue
          const rel = path.slice(process.cwd().length + 1)
          drawers.push(rel)
          // Every <Tooltip ...> opening tag of the file carries the class.
          const tags = source.match(/<Tooltip\b[^>]*>/g) ?? []
          if (tags.length === 0 || !tags.every((tag) => /className=\{[^}]*\bTOOLTIP_PANEL_CLASS\b/.test(tag))) unmarked.push(rel)
        }
      }
    }
    for (const root of ['app', 'components', 'lib', 'hooks']) walk(join(process.cwd(), root))
    // A scan that found none would pass on nothing.
    expect(drawers.sort()).toEqual(['components/dashboard/Sidebar.tsx', 'components/funnels/FunnelRail.tsx', 'components/theme/ThemeMenuSwitch.tsx', 'components/ui/compact-number.tsx'])
    expect(unmarked).toEqual([])
  })

  it('a rounded number\'s tooltip carries the class on its panel', async () => {
    const { findByRole } = render(<CompactNumber value={13779} />)
    const number = screen.getByText('13.8K')
    fireEvent.focus(number)
    const tip = await findByRole('tooltip')
    // Radix draws the visible panel around a hidden copy with the role: the class is on the panel.
    const panel = tip.closest(`.${names.TOOLTIP_PANEL_CLASS}`)
    expect(panel).toBeTruthy()
    expect(panel?.textContent).toContain('13,779')
  })

  it('the three names are the ones the stylesheet uses', () => {
    expect(names).toMatchObject({ INFO_TIP_PANEL_CLASS: 'info-tip-panel', INFO_TIP_GLYPH_CLASS: 'info-tip-glyph', TOOLTIP_PANEL_CLASS: 'tooltip-panel' })
    for (const name of Object.values(names)) expect(css, name).toContain(`html:root .${name}`)
  })
})
