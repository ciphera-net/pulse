import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import {
  BAND,
  BAND_COLOR,
  BASE_OPACITY,
  BASE_RAMP,
  BASE_TILE,
  CELL_H,
  CELL_W,
  FONT_STACK,
  GROUND_OPACITY,
  WAVE_RAMP,
  WAVE_TILE,
  bandAt,
  baseTileSvg,
  easeSweep,
  glyphRow,
  hash,
  tileSize,
  tileSvg,
  waveTileSvg,
} from '@/lib/skeleton/dither'
import config from '../../../tailwind.config'

// The dither's look as data. What is pinned here is what the stylesheet, the server's HTML and the band's canvas
// all rely on: the pattern is the same every time it is made, a tile is a whole number of pixels wide (or it opens
// a seam where it repeats), and every row is stretched to exactly that width whatever the browser's face.

describe('the glyph pattern', () => {
  it('is the same every time: the stylesheet, the server and the browser draw one pattern', () => {
    expect(hash(1, 2, 3)).toBe(hash(1, 2, 3))
    expect(glyphRow(97, 40, BASE_RAMP)).toBe(glyphRow(97, 40, BASE_RAMP))
    expect(baseTileSvg()).toBe(baseTileSvg())
    // A value in [0, 1), and not a constant.
    const values = Array.from({ length: 200 }, (_, i) => hash(i, 97, 29))
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true)
    expect(new Set(values).size).toBeGreaterThan(190)
  })

  it('draws a row of exactly the length asked, from its ramp alone', () => {
    const row = glyphRow(97, 128, BASE_RAMP)
    expect([...row]).toHaveLength(128)
    expect([...row].every((g) => BASE_RAMP.includes(g))).toBe(true)
    const wave = glyphRow(397, 64, WAVE_RAMP)
    expect([...wave].every((g) => WAVE_RAMP.includes(g))).toBe(true)
  })

  it('is mostly the light shade with the medium one here and there, and differs from row to row', () => {
    const rows = Array.from({ length: BASE_TILE.rows }, (_, r) => glyphRow(97 + r, BASE_TILE.cols, BASE_RAMP))
    const all = rows.join('')
    const medium = [...all].filter((g) => g === '▒').length / all.length
    // The ramp is four light to one medium, tilted a little towards the later glyphs.
    expect(medium).toBeGreaterThan(0.12)
    expect(medium).toBeLessThan(0.3)
    expect(new Set(rows).size).toBe(BASE_TILE.rows)
  })
})

describe('the tiles', () => {
  it('are a whole number of pixels wide and high, so a repeat leaves no seam', () => {
    // 32 cells are 231 px: columns come in multiples of 32.
    expect(CELL_W * 32).toBe(231)
    for (const tile of [BASE_TILE, WAVE_TILE]) {
      expect(tile.cols % 32).toBe(0)
      const { width, height } = tileSize(tile)
      expect(Number.isInteger(width)).toBe(true)
      expect(Number.isInteger(height)).toBe(true)
    }
    expect(tileSize(BASE_TILE)).toEqual({ width: 924, height: 384 })
    expect(tileSize(WAVE_TILE)).toEqual({ width: 462, height: 240 })
  })

  it('stretch every row to exactly the tile\'s width, whatever a face\'s own advance', () => {
    const svg = baseTileSvg()
    const rows = svg.match(/<text [^>]*>/g) ?? []
    expect(rows).toHaveLength(BASE_TILE.rows)
    expect(rows.every((r) => r.includes("textLength='924'"))).toBe(true)
    // One row per 12 px, each on the middle of its line.
    const ys = rows.map((r) => Number(/y='([\d.]+)'/.exec(r)?.[1]))
    expect(ys[0]).toBe(CELL_H / 2)
    expect(ys.every((y, i) => y === i * CELL_H + CELL_H / 2)).toBe(true)
    expect(svg).toContain("dominant-baseline='central'")
  })

  it('name system faces only, with no quote that would end the attribute or the stylesheet\'s string', () => {
    const svg = baseTileSvg()
    expect(svg).toContain(`font-family='${FONT_STACK}'`)
    expect(FONT_STACK).not.toMatch(/["']/)
    expect(svg).not.toContain('"')
  })

  it('the still pattern is black on nothing (a mask reads the alpha), at its own size', () => {
    const svg = baseTileSvg()
    expect(svg).toContain("width='924' height='384' viewBox='0 0 924 384'")
    expect(svg).toContain("fill='#000'")
    expect([...svg].filter((g) => g === '░' || g === '▒')).toHaveLength(BASE_TILE.cols * BASE_TILE.rows)
  })

  it('the band is two frames in the brand orange, drawn at the device\'s pixel density', () => {
    const svg = waveTileSvg(2)
    // Twice the pixels, the same drawing.
    expect(svg).toContain("width='924' height='960' viewBox='0 0 462 480'")
    expect(svg).toContain(`fill='${BAND_COLOR}'`)
    expect(BAND_COLOR).toBe('#FD5E0F')
    const rows = svg.match(/<text [^>]*>[^<]*<\/text>/g) ?? []
    expect(rows).toHaveLength(WAVE_TILE.rows * 2)
    // The second frame starts under the first and holds other glyphs: that is the flicker.
    const text = (r: string | undefined) => (r ?? '').replace(/<[^>]+>/g, '')
    expect(/y='246'/.test(rows[WAVE_TILE.rows] ?? '')).toBe(true)
    expect(text(rows[0])).not.toBe(text(rows[WAVE_TILE.rows]))
    expect(waveTileSvg(1)).toContain("width='462' height='480' viewBox='0 0 462 480'")
  })

  it('a tile of several frames seeds each frame 300 on, and a scale changes the size only', () => {
    const one = tileSvg({ cols: 32, rows: 2, ramp: WAVE_RAMP, seed: 5, frames: 2, fill: '#000' })
    expect(one).toContain(glyphRow(5, 32, WAVE_RAMP))
    expect(one).toContain(glyphRow(305, 32, WAVE_RAMP))
    const scaled = tileSvg({ cols: 32, rows: 2, ramp: WAVE_RAMP, seed: 5, frames: 2, fill: '#000', scale: 1.5 })
    expect(scaled.replace(/width='[\d.]+' height='[\d.]+'/, '')).toBe(one.replace(/width='[\d.]+' height='[\d.]+'/, ''))
  })
})

describe('the band\'s sweep', () => {
  it('is 55% of the bar wide, starts before the bar and ends after it', () => {
    const bar = 400
    const start = bandAt(0, bar)
    const end = bandAt(1, bar)
    expect(start.width).toBeCloseTo(220)
    // From 120% of the free width before the bar to 220% of it after.
    expect(start.left).toBeCloseTo(-1.2 * 180)
    expect(end.left).toBeCloseTo(2.2 * 180)
    // Wholly outside at both ends: a sweep begins and ends on a bar with no band.
    expect(start.left + start.width).toBeLessThanOrEqual(4.01)
    expect(end.left).toBeGreaterThanOrEqual(bar - 4.01)
  })

  it('moves one way, eased at both ends', () => {
    const steps = Array.from({ length: 101 }, (_, i) => easeSweep(i / 100))
    expect(steps[0]).toBe(0)
    expect(steps[100]).toBe(1)
    expect(steps.every((v, i) => i === 0 || v >= steps[i - 1])).toBe(true)
    expect(easeSweep(0.5)).toBeCloseTo(0.5, 2)
    // Slow at the ends, quick in the middle.
    expect(steps[10] - steps[0]).toBeLessThan(steps[55] - steps[45])
    // Outside its range it holds the end it is nearest.
    expect(easeSweep(-1)).toBe(0)
    expect(easeSweep(2)).toBe(1)
    expect(easeSweep(Number.NaN)).toBe(0)
  })

  it('keeps the numbers the look was ruled with', () => {
    expect(BAND).toEqual({ width: 0.55, opacity: 0.75, sweepMs: 1800, flickMs: 120 })
    expect(BASE_OPACITY).toBe(0.22)
    expect(GROUND_OPACITY).toBe(0.06)
  })
})

describe('the stylesheet carries the still pattern, from this module', () => {
  const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

  /** What the Tailwind config's plugins add to the base layer, by selector. */
  function baseRules(): Record<string, Record<string, string>> {
    const added: Record<string, Record<string, string>> = {}
    for (const entry of (config.plugins ?? []) as unknown[]) {
      const handler = typeof entry === 'function' ? entry : (entry as { handler?: unknown }).handler
      if (typeof handler !== 'function') continue
      try {
        ;(handler as (api: unknown) => void)({
          addBase: (rules: Record<string, Record<string, string>>) => {
            for (const [selector, declarations] of Object.entries(rules)) added[selector] = { ...added[selector], ...declarations }
          },
        })
      } catch {
        // A plugin that needs more of Tailwind's API than addBase is not one of ours.
      }
    }
    return added
  }

  it('as a CSS variable holding the picture, in plain ASCII, with its size beside it', () => {
    const root = baseRules()[':root']
    const value = root['--skeleton-dither']
    expect(value.startsWith('url("data:image/svg+xml;base64,')).toBe(true)
    // ASCII only: a stylesheet read in the wrong charset cannot turn the glyphs into something else.
    expect(/^[\x20-\x7e]+$/.test(value)).toBe(true)
    const base64 = value.slice('url("data:image/svg+xml;base64,'.length, -2)
    expect(Buffer.from(base64, 'base64').toString('utf8')).toBe(baseTileSvg())
    expect(root['--skeleton-dither-size']).toBe('924px 384px')
  })

  it('and the rules that use it keep the module\'s two strengths', () => {
    const css = read('styles/globals.css')
    expect(css).toContain(`background-color: rgb(var(--neutral-400) / ${GROUND_OPACITY});`)
    expect(css).toContain(`background-color: rgb(var(--neutral-400) / ${BASE_OPACITY});`)
    expect(css).toContain('mask: var(--skeleton-dither) 0 0 / var(--skeleton-dither-size) repeat;')
    expect(css).toContain('-webkit-mask: var(--skeleton-dither) 0 0 / var(--skeleton-dither-size) repeat;')
  })

  it('texture every bar, for every reader, at a weight over the piece\'s own gray fill', () => {
    const css = read('styles/globals.css')
    // Every rule that names a bar starts with `html:root`: it matches every page, and it weighs what the new look's
    // class on <html> weighed until 15-11-2026, so a piece's own `bg-neutral-800` (a utility, later in the sheet)
    // cannot win over the dither's ground. Without it the rule would tie with that utility and lose.
    const rules = css.match(/^[^\n{}]*\.skeleton\b[^\n{}]*\{/gm) ?? []
    expect(rules.length).toBeGreaterThanOrEqual(4)
    for (const rule of rules) expect(rule.trim().startsWith('html:root '), rule).toBe(true)
    // The look's class and the two shapes are gone.
    expect(css).not.toContain('html.new-dashboard ')
    expect(css).not.toMatch(/skeleton-(new|old)-shape/)
  })

  it('a bar that is already placed keeps its placing', () => {
    const css = read('styles/globals.css')
    expect(css).toContain('html:root .skeleton:not(.absolute):not(.fixed):not(.sticky) {\n    position: relative;')
  })
})

describe('the notice the ported pattern asks for', () => {
  const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')
  const notices = () => read('THIRD-PARTY-NOTICES.md')
  /** The skeleton's own source files (not their tests) that say they took something from the library. */
  const borrowers = () =>
    ['lib/skeleton', 'components/skeleton']
      .flatMap((dir) => readdirSync(join(process.cwd(), dir)).filter((f) => /\.tsx?$/.test(f)).map((f) => `${dir}/${f}`))
      .filter((file) => read(file).includes('ascii-reveal'))

  it('is at the root of the repository, with the library\'s copyright line and its permission text', () => {
    // MIT asks for both in every copy: a notice without the permission text is not the licence.
    expect(notices()).toContain('Copyright (c) 2026 Quan Hoang')
    expect(notices()).toContain('Permission is hereby granted, free of charge, to any person obtaining a copy')
    expect(notices()).toContain('The above copyright notice and this permission notice shall be included in all')
    expect(notices()).toContain('THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND')
    // The commit the pattern was read at, whole, so the source can be found again.
    expect(notices()).toContain('ec413f44933e4c08df202edaaed83ce77c342c3e')
  })

  it('is named by every file that took something, and names each of them back', () => {
    // The pattern and the band: a scan that found neither would pass on nothing.
    expect(borrowers()).toEqual(expect.arrayContaining(['lib/skeleton/dither.ts', 'lib/skeleton/band.ts']))
    for (const file of borrowers()) {
      expect(read(file), file).toContain('THIRD-PARTY-NOTICES.md')
      expect(notices(), file).toContain(`\`${file}\``)
    }
  })
})
