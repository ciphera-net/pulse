/**
 * Pulse's half of the light palette (PULSE-31, design §4.4 revision E1).
 *
 *  1. DARK IS BYTE-IDENTICAL. Tailwind's `neutral-*`, `white` and the status
 *     hues now read CSS variables; in dark each must equal Tailwind's own
 *     default, or every call site silently shifts colour for every user who
 *     never asked for a light theme.
 *  2. The ramp steps and hue shades used as TEXT stay readable (>= 4.5:1) on
 *     the light page and card.
 *  3. The chart variables' light class and match-system block are identical.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import colors from 'tailwindcss/colors'
import config from '../../tailwind.config'
import { HUE_OVERRIDES, MIRROR, SHADES, THEMED_HUES, darkGroundVariables, hexToTriplet, rampColors, rampVariables } from '../themeRamp'

const { dark, light } = rampVariables()
const tw = colors as unknown as Record<string, Record<string, string>>

function lum(t: string): number {
  return t
    .split(' ')
    .map(Number)
    .map((x) => { const s = x / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 })
    .reduce((acc, x, i) => acc + x * [0.2126, 0.7152, 0.0722][i], 0)
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
const PAGE = '244 244 244'
const CARD = '255 255 255'

describe('themed ramps: dark is unchanged', () => {
  it("neutral, white and every status hue equal Tailwind's defaults in dark", () => {
    expect(dark['--white']).toBe('255 255 255')
    for (const hue of ['neutral', ...THEMED_HUES]) {
      for (const s of SHADES) expect(dark[`--${hue}-${s}`], `${hue}-${s}`).toBe(hexToTriplet(tw[hue][s]))
    }
  })

  it('every ramp colour key reads a variable that both palettes define', () => {
    const keys = rampColors()
    for (const [hue, v] of Object.entries(keys)) {
      const refs = typeof v === 'string' ? [v] : Object.values(v)
      for (const ref of refs) {
        const name = ref.match(/var\((--[a-z0-9-]+)\)/)![1]
        expect(dark[name], name).toBeDefined()
        expect(light[name], name).toBeDefined()
      }
      expect(hue).not.toBe('black') // scrims stay dark: black is never themed
    }
  })

  it('the Tailwind config actually uses the ramp (not a stale hand copy)', () => {
    const c = (config.theme?.extend?.colors ?? {}) as Record<string, unknown>
    expect(c.neutral).toEqual(rampColors().neutral)
    expect(c.red).toEqual(rampColors().red)
    expect(c.white).toBe('rgb(var(--white) / <alpha-value>)')
  })
})

describe('themed ramps: light is readable', () => {
  // Shades the dashboard uses as TEXT (census 24-09-2026).
  const TEXT: Array<[string, string]> = [
    ['white', '--white'],
    ...(['300', '400', '500'] as const).map((s) => [`neutral-${s}`, `--neutral-${s}`] as [string, string]),
    ...THEMED_HUES.flatMap((h) => (['300', '400', '500'] as const).map((s) => [`${h}-${s}`, `--${h}-${s}`] as [string, string])),
  ]
  for (const [name, v] of TEXT) {
    for (const [surface, bg] of [['page', PAGE], ['card', CARD]]) {
      it(`light ${name} as text on the ${surface} is at least 4.5:1`, () => {
        expect(contrast(light[v], bg)).toBeGreaterThanOrEqual(4.5)
      })
    }
  }

  it('faint marks (text-neutral-700) are as faint on light as on dark, within 0.1', () => {
    const DARK_CARD = '15 15 15'
    const want = contrast(dark['--neutral-700'], DARK_CARD)
    expect(Math.abs(contrast(light['--neutral-700'], CARD) - want)).toBeLessThan(0.1)
  })

  it('status hues keep their hue and flip lightness', () => {
    for (const hue of THEMED_HUES) {
      expect(light[`--${hue}-400`]).toBe(hexToTriplet(tw[hue][HUE_OVERRIDES[hue]?.['400'] ?? MIRROR['400']]))
      expect(lum(light[`--${hue}-400`])).toBeLessThan(lum(dark[`--${hue}-400`]))
      expect(lum(light[`--${hue}-900`])).toBeGreaterThan(lum(dark[`--${hue}-900`]))
    }
  })
})

describe('chart variables', () => {
  const css = readFileSync(path.join(__dirname, '..', 'globals.css'), 'utf8')
  const block = (re: RegExp, src = css) => {
    const m = src.match(new RegExp(re.source + '\\s*\\{([^}]*)\\}', re.flags))
    if (!m) throw new Error(`no block for ${re}`)
    return Object.fromEntries([...m[1].matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map(([, k, v]) => [k, v.trim()]))
  }
  const root = block(/:root(?![.\w])/)
  const lightBlock = block(/:root\.light/)
  const media = css.match(/@media \(prefers-color-scheme: light\)\s*\{([\s\S]*?)\n {2}\}/)
  const systemBlock = block(/:root\.theme-system/, media ? media[1] : '')

  it('the light class and the match-system block are identical', () => {
    expect(Object.keys(lightBlock).length).toBeGreaterThan(0)
    expect(systemBlock).toEqual(lightBlock)
  })

  it('every light chart variable overrides one the dark :root declares', () => {
    for (const k of Object.keys(lightBlock)) expect(root[k], k).toBeDefined()
  })
})

// 14-11-2026 (Pulse/docs/plans/14-11-2026-light-theme-site-cards.md): a subtree on a ground that is dark in both
// themes (the Your Sites cards' scrim, chip and gear) takes `dark-ground` and keeps the dark palette, so the light
// theme cannot turn its white text into near-black on near-black.
describe('dark ground', () => {
  const ground = darkGroundVariables()

  it('holds the dark value of every ramp variable, plus the dark brand ink and nothing else', () => {
    for (const [name, value] of Object.entries(dark)) expect(ground[name], name).toBe(value)
    expect(Object.keys(ground).sort()).toEqual([...Object.keys(dark), '--brand-ink'].sort())
  })

  it("its brand ink is facet.css's DARK --brand-ink (the :root block), never the light one", () => {
    const css = readFileSync(path.join(__dirname, '..', '..', 'node_modules', '@ciphera-net', 'facet', 'dist', 'facet.css'), 'utf8')
    const block = (selector: string) => {
      const start = css.indexOf(`${selector} {`)
      expect(start, selector).toBeGreaterThanOrEqual(0)
      return css.slice(start, css.indexOf('}', start))
    }
    const ink = (b: string) => b.match(/--brand-ink:\s*([0-9 ]+);/)?.[1]
    expect(ground['--brand-ink']).toBe(ink(block('\n:root')))
    expect(ground['--brand-ink']).not.toBe(ink(block(':root.light')))
  })

  it('the Tailwind plugin emits it under .dark-ground', () => {
    const emitted: Record<string, unknown> = {}
    const ramp = (config.plugins ?? [])[0] as { handler: (api: { addBase: (b: Record<string, unknown>) => void }) => void }
    ramp.handler({ addBase: (b) => Object.assign(emitted, b) })
    expect(emitted['.dark-ground']).toEqual(ground)
    expect(emitted[':root.light']).toEqual(light)
  })
})
