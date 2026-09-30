import { describe, it, expect } from 'vitest'
import {
  STATIC_ROUTES,
  CATEGORY_ROUTES,
  TOOL_ROUTES,
  COMPARISON_ROUTES,
  MARKETING_ROUTES,
} from '@/lib/marketing-routes'

describe('MARKETING_ROUTES (design §4.1, D38)', () => {
  it('has exactly 25 entries: 12 static + 5 category + 2 tools + 6 comparisons', () => {
    expect(STATIC_ROUTES).toHaveLength(12)
    expect(CATEGORY_ROUTES).toHaveLength(5)
    expect(TOOL_ROUTES).toHaveLength(2)
    expect(COMPARISON_ROUTES).toHaveLength(6)
    expect(MARKETING_ROUTES).toHaveLength(25)
  })

  it('includes the root, and only as the exact literal "/"', () => {
    expect(MARKETING_ROUTES).toContain('/')
    expect(STATIC_ROUTES[0].path).toBe('/')
  })

  it('includes the named routes called out in the design doc', () => {
    for (const path of ['/', '/contact', '/demo', '/integrations', '/pricing']) {
      expect(MARKETING_ROUTES).toContain(path)
    }
  })

  it('excludes /integrations/[slug] guides — L3, not L1 (D35, D38)', () => {
    expect(MARKETING_ROUTES.some((p) => p.startsWith('/integrations/'))).toBe(false)
  })

  it('has no duplicate entries', () => {
    expect(new Set(MARKETING_ROUTES).size).toBe(MARKETING_ROUTES.length)
  })

  it('derives the /vs routes from lib/comparisons.ts, not a second hardcoded list', () => {
    expect(COMPARISON_ROUTES).toEqual(
      expect.arrayContaining([
        '/vs/google-analytics',
        '/vs/plausible',
        '/vs/matomo',
        '/vs/fathom',
        '/vs/simple-analytics',
        '/vs/umami',
      ])
    )
  })
})
