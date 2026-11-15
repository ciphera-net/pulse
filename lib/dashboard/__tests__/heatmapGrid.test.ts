import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { HEAT_COLUMNS, HEAT_GAP_PX, HEAT_ROWS, heatRowsHeight } from '@/lib/dashboard/heatmapGrid'

// The heat map's grid as numbers, and the height its skeleton takes from them. The cells are square, so the seven
// rows are as tall as their width decides: this is the one part of the dashboard whose height follows its width,
// and a skeleton of a fixed height was right at one width only (97 px too tall at 1024).

/** The formula's two numbers: a share of the width, and a fixed part. */
function parts() {
  const m = /^calc\(([\d.]+)% - ([\d.]+)px\)$/.exec(heatRowsHeight())
  if (!m) throw new Error(`not the shape expected: ${heatRowsHeight()}`)
  return { share: Number(m[1]) / 100, fixed: Number(m[2]) }
}

/** What a browser lays out: seven rows of square cells, 24 to a row, 2 px between cells and between rows. */
function laidOut(width: number) {
  const cell = (width - (HEAT_COLUMNS - 1) * HEAT_GAP_PX) / HEAT_COLUMNS
  return HEAT_ROWS * cell + (HEAT_ROWS - 1) * HEAT_GAP_PX
}

describe('heatRowsHeight', () => {
  it('is a share of the width less a fixed part', () => {
    expect(heatRowsHeight()).toMatch(/^calc\([\d.]+% - [\d.]+px\)$/)
  })

  it.each([272, 558, 814, 1070, 1148, 1600])('is the grid\'s own height at a grid %d px wide', (width) => {
    const { share, fixed } = parts()
    // Within a hundredth of a pixel of what the browser lays out.
    expect(Math.abs(share * width - fixed - laidOut(width))).toBeLessThan(0.01)
  })

  it('gives the heights measured on the built page: 321 px in a 1,148 px grid, 66 px in a 272 px one', () => {
    const { share, fixed } = parts()
    // The seven rows without the gaps between them were 321.4 px at 1440 and 65.9 px on a phone.
    expect(share * 1148 - fixed - (HEAT_ROWS - 1) * HEAT_GAP_PX).toBeCloseTo(321.4, 1)
    expect(share * 272 - fixed - (HEAT_ROWS - 1) * HEAT_GAP_PX).toBeCloseTo(65.9, 1)
  })
})

describe('the component draws the grid these numbers describe', () => {
  const source = readFileSync(join(process.cwd(), 'components/dashboard/PeakHours.tsx'), 'utf8')

  it('one column per hour, from the shared number', () => {
    expect(HEAT_COLUMNS).toBe(24)
    expect(source).toContain('const BUCKETS = HEAT_COLUMNS')
    expect(source).toContain('gridTemplateColumns: `repeat(${BUCKETS}, 1fr)`')
  })

  it('seven rows, one per day', () => {
    expect(HEAT_ROWS).toBe(7)
    expect(source).toContain("const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']")
  })

  it('the same gap between cells and between rows', () => {
    expect(HEAT_GAP_PX).toBe(2)
    expect(source).toContain(`gap: '${HEAT_GAP_PX}px'`)
    expect(source).toContain(`gap-[${HEAT_GAP_PX}px]`)
    expect(source).toContain('aspect-square')
  })
})
