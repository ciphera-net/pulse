/**
 * The dither texture of Pulse's skeletons: what it is made of, as plain data and pure functions.
 *
 * A skeleton bar is a field of shade glyphs (░ with a ▒ here and there) at low opacity, and a band of denser
 * glyphs (▒▓█) in the brand orange sweeps across it. This module holds the numbers of that look and builds the two
 * pictures it is drawn from, as SVG text:
 *   - the STILL pattern, which the stylesheet carries as a CSS variable (tailwind.config.ts emits it from here),
 *     so a bar is textured by CSS alone: on the server's HTML, before any script, at any size;
 *   - the BAND's two glyph frames, which lib/skeleton/band.ts draws on a canvas once the page runs.
 * One source for both, so the band's glyphs stand on the still pattern's grid and the two cannot drift.
 *
 * Leaf module on purpose: loaded by Tailwind's config loader, by the browser and by vitest, so it touches no
 * React, no DOM and no Node API.
 *
 * The glyph pattern (the hash, the rows, the two ramps, the band's numbers) is ported from ascii-reveal 0.3.0,
 * src/core/skeleton.ts and src/core/util.ts, MIT, Copyright (c) 2026 Quan Hoang
 * (https://github.com/quanhoangindex/ascii-reveal, commit ec413f44). The licence text is in
 * THIRD-PARTY-NOTICES.md at the root of this repository. What differs here: the library writes its glyphs into
 * the page as text, 96 to a row, and rasterises the band's glyphs for every bar; here the still pattern is one
 * tiled picture in the stylesheet and the band is drawn from one shared picture, so a bar of any size is whole
 * and costs no markup.
 */

/** One glyph cell. The width is the advance of a 12 px glyph in the face the look was ruled in; 32 cells are 231 px. */
export const CELL_W = 7.21875
export const CELL_H = 12
export const FONT_PX = 12
/** System faces only: a picture cannot load a web font. No quotes, so the list can sit in an SVG attribute. */
export const FONT_STACK = 'ui-monospace,SF Mono,Menlo,Consolas,monospace'

/** The still pattern: mostly the light shade, one cell in five the medium one. */
export const BASE_RAMP = '░░░░▒'
/** The band: the medium, dark and full shades. */
export const WAVE_RAMP = '▒▓▓█▓▒'
/** Below 1 favours the later glyphs of a ramp a little (the library's value for dither). */
const BIAS = 0.9

/** How much of the ink the still pattern and the bar's ground show. */
export const BASE_OPACITY = 0.22
export const GROUND_OPACITY = 0.06

/** The band: its share of a bar's width, its strength, one sweep, and how often its glyphs change. */
export const BAND = { width: 0.55, opacity: 0.75, sweepMs: 1800, flickMs: 120 } as const
/** The brand orange. */
export const BAND_COLOR = '#FD5E0F'

/**
 * The still pattern's tile: 924 x 384 px. A bar shows it from its own top left corner and repeats it past that
 * size, which no eye finds in a field of two shades. Columns in multiples of 32 keep the width a whole pixel.
 */
export const BASE_TILE = { cols: 128, rows: 32 } as const
/** The band's tile: 462 x 240 px, drawn twice (two frames). Small: only a band's width of it ever shows. */
export const WAVE_TILE = { cols: 64, rows: 20 } as const

/** A tile's size in CSS pixels. */
export const tileSize = (tile: { cols: number; rows: number }) => ({ width: tile.cols * CELL_W, height: tile.rows * CELL_H })

/** Small integer hash in [0, 1). Deterministic: the server, the stylesheet and the browser draw the same pattern. */
export function hash(a: number, b: number, c: number): number {
  let h =
    Math.imul(a | 0, 0x27d4eb2d) ^
    Math.imul(((b | 0) + 0x9e3779b9) | 0, 0x85ebca6b) ^
    Math.imul(((c | 0) + 0x632be5ab) | 0, 0xc2b2ae35)
  h ^= h >>> 15
  h = Math.imul(h, 0x2c1b3c6d)
  h ^= h >>> 12
  h = Math.imul(h, 0x297a2d39)
  h ^= h >>> 15
  return (h >>> 0) / 4294967296
}

/** One row of glyphs from a ramp. */
export function glyphRow(seed: number, len: number, ramp: string): string {
  let out = ''
  for (let i = 0; i < len; i++) out += ramp[Math.floor(Math.pow(hash(i, seed, 29), BIAS) * ramp.length)]
  return out
}

interface TileSpec {
  cols: number
  rows: number
  ramp: string
  /** Rows are seeded `seed + row`, and each further frame 300 on, as the library seeds its band's two layers. */
  seed: number
  /** How many pictures of the pattern, stacked: the band flickers between two. */
  frames?: number
  /** Any CSS colour. A mask only reads the alpha, so the still pattern's is black. */
  fill: string
  /** Device pixels per CSS pixel the picture is to be drawn at: its own size in pixels is multiplied by it. */
  scale?: number
}

/**
 * A tile as an SVG picture: one <text> per row, each stretched to exactly the tile's width, so a cell is the
 * same width in every browser and every face (the faces' own advances differ by a few percent, which would
 * open a seam where the tile repeats and move the band's glyphs off the pattern's).
 */
export function tileSvg({ cols, rows, ramp, seed, frames = 1, fill, scale = 1 }: TileSpec): string {
  const { width, height } = tileSize({ cols, rows })
  const lines: string[] = []
  for (let frame = 0; frame < frames; frame++) {
    for (let row = 0; row < rows; row++) {
      const y = frame * height + row * CELL_H + CELL_H / 2
      lines.push(`<text y='${y}' textLength='${width}'>${glyphRow(seed + row + 300 * frame, cols, ramp)}</text>`)
    }
  }
  return (
    `<svg xmlns='http://www.w3.org/2000/svg' width='${width * scale}' height='${height * frames * scale}' viewBox='0 0 ${width} ${height * frames}'>` +
    `<g font-family='${FONT_STACK}' font-size='${FONT_PX}' fill='${fill}' dominant-baseline='central'>` +
    lines.join('') +
    '</g></svg>'
  )
}

/** The seed of the page's one still pattern and of its band (the library's first skeleton: seed 1, block 0). */
const SEED = 97

/** The still pattern, for the stylesheet. */
export const baseTileSvg = (): string => tileSvg({ ...BASE_TILE, ramp: BASE_RAMP, seed: SEED, fill: '#000' })

/** The band's two frames in the brand orange, for the canvas, at a device's pixel density. */
export const waveTileSvg = (scale: number): string =>
  tileSvg({ ...WAVE_TILE, ramp: WAVE_RAMP, seed: SEED + 300, frames: 2, fill: BAND_COLOR, scale })

/**
 * Where the band stands at a moment of its sweep, as the library's stylesheet moved it: from 120% of the free
 * width before the bar to 220% of it after, eased. `at` runs 0 to 1 over one sweep. Returns the band's left edge
 * and width in the bar's own pixels.
 */
export function bandAt(at: number, barWidth: number): { left: number; width: number } {
  const width = barWidth * BAND.width
  return { left: (barWidth - width) * (-1.2 + 3.4 * easeSweep(at)), width }
}

/** cubic-bezier(.45, .05, .55, .95), solved for a time: the sweep's easing. */
export function easeSweep(t: number): number {
  if (!(t > 0)) return 0
  if (t >= 1) return 1
  let lo = 0
  let hi = 1
  let u = t
  for (let n = 0; n < 28; n++) {
    u = (lo + hi) / 2
    const x = 3 * (1 - u) ** 2 * u * 0.45 + 3 * (1 - u) * u * u * 0.55 + u ** 3
    if (x < t) lo = u
    else hi = u
  }
  return 3 * (1 - u) ** 2 * u * 0.05 + 3 * (1 - u) * u * u * 0.95 + u ** 3
}
