/**
 * The CDN marketing claim must match the product's own glossary.
 *
 * The features page described the CDN map as "per-country traffic", which
 * reads as visitor geography — the thing the card directly above it ("Country,
 * region, and city-level breakdowns") legitimately sells. The CDN map is not
 * that: it is bandwidth per Bunny EDGE POP. The in-product glossary has always
 * said so (`cdn_served_from_regions`: "where bytes were served from, not where
 * visitors are"), so the marketing page contradicted the dashboard a customer
 * would land on. It survived unchanged because no test read the copy.
 *
 * This is a source-text guard rather than a render test: the page is a heavy
 * client component, and what is being protected is the string itself.
 *
 * Batch 5 then deleted the CDN map outright (bandwidth per edge POP drawn on
 * a country map was the confusion made visual); the copy now sells the ranked
 * region breakdown that remains, and the map guard below keeps the promise
 * from creeping back.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { TERMS } from '@/lib/dashboard/terms'

const featuresSource = readFileSync(join(process.cwd(), 'app/features/page.tsx'), 'utf8')

/** Pull the `description` that follows a given card `title` in the source. */
function cardDescription(title: string): string {
  const at = featuresSource.indexOf(`title: '${title}'`)
  expect(at, `no feature card titled "${title}"`).toBeGreaterThan(-1)
  const match = /description: '([^']*(?:''[^']*)*)'/.exec(featuresSource.slice(at))
  expect(match, `no description for "${title}"`).not.toBeNull()
  return match![1]
}

describe('CDN analytics marketing copy', () => {
  const description = cardDescription('CDN analytics')

  it('the glossary still frames the map as edge regions, not visitors', () => {
    // The honest source of truth this copy has to agree with.
    const term = TERMS.cdn_served_from_regions
    expect(term.definition).toContain('where bytes were served from, not where visitors are')
  })

  it('does not describe the CDN map as visitor countries', () => {
    expect(description.toLowerCase()).not.toContain('per-country')
    expect(description.toLowerCase()).not.toContain('per country')
    expect(description.toLowerCase()).not.toContain('visitor countries')
  })

  it('describes the honest mechanics — where bytes were served from', () => {
    expect(description).toMatch(/edge region/i)
    expect(description).toMatch(/served from/i)
  })

  it('does not promise a map — the CDN edge-POP map was removed with the triage', () => {
    // The CDN page renders a ranked region breakdown; the dotted world map is
    // gone. Only the Geographic-insights card may sell a map (that one lives).
    expect(description.toLowerCase()).not.toMatch(/\bmaps?\b/)
  })

  it('leaves the real visitor-geography claim alone', () => {
    // The separate, accurate feature — this one MAY talk about countries.
    // Pinned by granularity rather than by sentence: the card must keep
    // claiming all three levels, but the wording was corrected on 03-09-2026
    // because the map itself is country-only and region/city live in tabs.
    const geo = cardDescription('Geographic insights')
    expect(geo).toMatch(/countr/i)
    expect(geo).toMatch(/region/i)
    expect(geo).toMatch(/cit(y|ies)/i)
  })
})
