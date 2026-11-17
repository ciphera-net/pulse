import { describe, expect, it } from 'vitest'
import { lengthAtX } from '../area-chart'

// Production crash, 17-11-2026 (client-errors): "Failed to execute 'getPointAtLength' on 'SVGGeometryElement': The
// element's path is empty", from the hover highlight's search, which put "Dashboard failed to load" over the page.
// A line that had been measured became empty and its remembered length was searched on the empty path.

/** A straight path from x=0, `length` long, that behaves as Chrome does when it is empty. */
function path(length: number) {
  return {
    getTotalLength: () => length,
    getPointAtLength: (l: number) => {
      if (length === 0) {
        throw new DOMException("Failed to execute 'getPointAtLength' on 'SVGGeometryElement': The element's path is empty.", 'InvalidStateError')
      }
      return { x: Math.min(l, length), y: 0 } as DOMPoint
    },
  }
}

describe('lengthAtX', () => {
  it('finds the length at an x on a drawn line', () => {
    expect(lengthAtX(path(800), 800, 300)).toBeCloseTo(300, 0)
  })

  it('answers 0 for a line that emptied after it was measured, instead of throwing', () => {
    expect(() => lengthAtX(path(0), 800, 300)).not.toThrow()
    expect(lengthAtX(path(0), 800, 300)).toBe(0)
  })

  it('searches only the live length when the line got shorter than remembered', () => {
    expect(lengthAtX(path(200), 800, 600)).toBeLessThanOrEqual(200)
  })

  it('answers 0 with no path or nothing measured', () => {
    expect(lengthAtX(null, 800, 300)).toBe(0)
    expect(lengthAtX(path(800), 0, 300)).toBe(0)
  })

  it('answers 0 when the browser throws for another reason', () => {
    const broken = { getTotalLength: () => 800, getPointAtLength: () => { throw new Error('detached') } }
    expect(lengthAtX(broken, 800, 300)).toBe(0)
  })
})
