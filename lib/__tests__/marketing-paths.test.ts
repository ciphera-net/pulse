import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isMarketingPath } from '../marketing-paths'

describe('isMarketingPath', () => {
  it('matches the marketing pages, with or without a query or hash', () => {
    for (const p of ['/', '/pricing', '/integrations', '/integrations/nextjs', '/vs/plausible', '/tools/utm-builder', '/blog/a-post', '/faq?x=1', '/features#top']) {
      expect(isMarketingPath(p), p).toBe(true)
    }
  })

  it('leaves the dashboard and absolute URLs alone', () => {
    for (const p of ['/sites', '/sites/new', '/settings/organization/billing', '/demo', '/integrationsx', '/vsx', 'https://pulse.ciphera.net/pricing', '//pricing', '#top']) {
      expect(isMarketingPath(p), p).toBe(false)
    }
  })
})

// The blank-dashboard fault (16-11-2026) came from next/link pointing at the
// marketing app. A literal marketing href on a next/link must not come back.
describe('no next/link to a marketing page', () => {
  const roots = ['app', 'components']
  const files: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === '__tests__') continue
      const full = join(dir, name)
      if (statSync(full).isDirectory()) walk(full)
      else if (full.endsWith('.tsx')) files.push(full)
    }
  }
  roots.forEach(walk)

  it('finds files to scan', () => {
    expect(files.length).toBeGreaterThan(50)
  })

  it('every <Link href="/..."> literal points at the dashboard', () => {
    const offenders: string[] = []
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      if (!src.includes("from 'next/link'")) continue
      for (const m of src.matchAll(/<Link\s[^>]*?href=["'{`]+(\/[^"'`}\s]*)/g)) {
        if (isMarketingPath(m[1])) offenders.push(`${f}: ${m[1]}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
