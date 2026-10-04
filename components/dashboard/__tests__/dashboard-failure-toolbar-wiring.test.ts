import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// pulse#893, source-level (the site-failure-wiring idiom: the dashboard page has no
// render harness). A failed dashboard request with nothing cached used to return the
// error card alone, so the period picker and the realtime orb vanished with the data
// and a period that fails every time could only be left by editing ?period= by hand.
// The failure branch must render the toolbar row, the error card, and the filter
// builder the toolbar's Filter button opens. A 404 is "Site not found", toolbar-free.
// Comments are stripped first, so a sentence about the wiring cannot satisfy the pin.
//
// MUTATION CHECK: delete `{toolbarRow()}` from the failure branch and the toolbar
// test fails; delete its <FilterBuilder and the builder test fails; drop the 404
// guard and the 404 test fails.
const read = (rel: string) =>
  readFileSync(join(process.cwd(), rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

const failureBranch = (src: string) => {
  const start = src.search(/if\s*\(\s*dashboardError\s*&&\s*!dashboard\s*\)\s*\{/)
  expect(start).toBeGreaterThan(-1)
  const end = src.indexOf('if (!site)', start)
  expect(end).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('a failed dashboard request keeps the toolbar', () => {
  const src = read('app/sites/[id]/page.tsx')
  const branch = failureBranch(src)

  it('renders the toolbar row above the error card', () => {
    const toolbar = branch.search(/\{\s*toolbarRow\(\)\s*\}/)
    const card = branch.search(/\{\s*failureCard\(\s*dashboardError/)
    expect(toolbar).toBeGreaterThan(-1)
    expect(card).toBeGreaterThan(-1)
    expect(toolbar).toBeLessThan(card)
  })

  it('renders the filter builder the toolbar opens', () => {
    expect(branch).toMatch(/<FilterBuilder\s+builder=\{filterBuilder\}/)
  })

  it('keeps a 404 as the bare site-not-found state', () => {
    expect(branch).toMatch(/status\s*===\s*404\s*\)\s*\{\s*return\s+failureState\(\s*dashboardError/)
  })

  it('uses the same toolbar row as a loaded dashboard', () => {
    const main = src.slice(src.search(/return\s*\(\s*<div className=\{`w-full max-w-7xl mx-auto px-4 sm:px-6 pb-8 \$\{fadeClass\}`\}>/))
    expect(main).toMatch(/\{\s*toolbarRow\(\)\s*\}/)
  })
})
