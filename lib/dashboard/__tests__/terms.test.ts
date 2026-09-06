import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { DIMENSION_TERM, METRIC_TERMS, TERMS, UPTIME_TERM, docsHref } from '@/lib/dashboard/terms'
import { METRIC_TYPES } from '@/lib/dashboard/metrics'

// ---------------------------------------------------------------------------
// The registry gate, enforced (metric info layer, 22-08-2026).
//
// A glyph must never promise a sentence that does not exist, and a footer link
// must never 404. The component fails safe (a nullish definition renders
// nothing), so these tests exist to catch the SILENT failure: a term
// referenced from a template that quietly renders no glyph at all, or a
// sibling set where one row got copy and the others did not — which reads as
// a bug, not as a gap.
//
// The template scan mirrors the conviction-lint precedent: it reads the actual
// component source rather than a list of intentions, because a hardcoded term
// key that never reaches the registry is exactly what a props-level test
// cannot see.
// ---------------------------------------------------------------------------

const ROOT = path.resolve(__dirname, '../../..')

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

/** Every product source file under the given roots (tests and harnesses excluded). */
function sourceFiles(roots: string[]): string[] {
  const out: string[] = []
  const walk = (rel: string) => {
    for (const entry of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.') || entry.name === '__tests__') continue
      const child = `${rel}/${entry.name}`
      if (entry.isDirectory()) walk(child)
      else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(child)
    }
  }
  for (const root of roots) walk(root)
  return out
}

/** Every `term="..."` / `term: '...'` literal a component hands to an InfoTip. */
function referencedTerms(source: string): string[] {
  return [...source.matchAll(/\bterm=(?:"([a-z_]+)"|\{'([a-z_]+)'\})/g)].map(
    (m) => m[1] ?? m[2],
  )
}

const TEMPLATES = [
  'components/uptime/UptimePanel.tsx',
  'components/uptime/IncidentsTable.tsx',
  'app/sites/[id]/uptime/page.tsx',
]

/**
 * Cards whose glyph is keyed on the ACTIVE TAB, and the TAB IDS each can show
 * — the literal strings the component holds in state, taken from its own `Tab`
 * union, NOT the registry keys they resolve to.
 *
 * 🔴 This list used to hold the INTENDED keys (`utm_source`, `pages`,
 * `scroll_depth`). Those are not what the components pass, so the test agreed
 * with a registry the product never reached: Campaigns and ContentStats each
 * rendered ZERO glyphs and the suite stayed green. A list of intentions cannot
 * catch a silent gate — the ids below are asserted against the source.
 */
const CARD_TABS: Record<string, string[]> = {
  // Sources (06-09-2026) holds Referrers · Channels · Campaigns; its `Tab`
  // union is the set of ids that reach the InfoTip — the two list views plus
  // the five UTM dimensions (the campaigns VIEW itself never reaches it).
  'components/dashboard/Sources.tsx': ['referrers', 'channels', 'source', 'medium', 'campaign', 'term', 'content'],
  'components/dashboard/Locations.tsx': ['map', 'countries', 'regions', 'cities', 'languages', 'timezones'],
  'components/dashboard/TechSpecs.tsx': ['browsers', 'os', 'devices', 'screens'],
  'components/dashboard/ContentStats.tsx': ['top_pages', 'entry_pages', 'exit_pages'],
  'components/dashboard/ContentSignals.tsx': ['scroll', 'events'],
}

/** What a card's tab id actually resolves to at render time. */
const resolve = (tab: string) => DIMENSION_TERM[tab] ?? tab

describe('terms registry', () => {
  it('defines a sentence for every deck metric', () => {
    for (const key of METRIC_TYPES) {
      const term = METRIC_TERMS[key]
      expect(term, `no registry entry for ${key}`).toBeDefined()
      expect(term.definition.length, `${key} has an empty definition`).toBeGreaterThan(10)
      expect(term.title.length).toBeGreaterThan(0)
    }
  })

  it('every term referenced by a template exists in the registry', () => {
    const missing: string[] = []
    for (const file of TEMPLATES) {
      for (const key of referencedTerms(read(file))) {
        if (!TERMS[key]) missing.push(`${file} → "${key}"`)
      }
    }
    expect(missing, `templates reference terms with no registry entry: ${missing.join(', ')}`).toEqual([])
  })

  it('the uptime rail is covered all-or-none', () => {
    const keys = Object.keys(UPTIME_TERM)
    expect(keys.length).toBeGreaterThan(0)
    const covered = keys.filter((k) => TERMS[UPTIME_TERM[k]])
    expect(
      covered.length,
      `uptime rail is partially covered (${covered.length}/${keys.length}) — a rail whose siblings have no sentence reads as a bug`,
    ).toBe(keys.length)
  })

  it('every published term points into the Pulse docs, and unpublished terms carry no link', () => {
    for (const term of [...Object.values(METRIC_TERMS), ...Object.values(TERMS)]) {
      const href = docsHref(term)
      if (term.docs) {
        // page#anchor into the Pulse docs — the pages that already existed.
        expect(term.docs).toMatch(/^[a-z-]+#[a-z0-9-]+$/)
        expect(href).toBe(`https://help.ciphera.net/docs/pulse/${term.docs}`)
      } else {
        expect(href).toBeUndefined()
      }
    }
  })

  it('a card glyph explains the CARD, never the rail metric', () => {
    // The defect this replaced: every card keyed its glyph on the selected
    // rail metric, so six glyphs on one screen all opened the same sentence
    // about unique visitors. A card's tabs must resolve to DISTINCT terms.
    for (const [file, tabs] of Object.entries(CARD_TABS)) {
      const covered = tabs.map(resolve).filter((t) => TERMS[t])
      expect(covered.length, `${file} has no covered tabs`).toBeGreaterThan(0)
      const sentences = covered.map((t) => TERMS[t].definition)
      expect(
        new Set(sentences).size,
        `${file}: two tabs resolve to the same sentence`,
      ).toBe(sentences.length)
    }
    // And across cards: no two dimension terms may share a definition.
    const all = Object.values(CARD_TABS).flat().map(resolve).filter((t) => TERMS[t]).map((t) => TERMS[t].definition)
    expect(new Set(all).size, 'two dimension terms share a definition').toBe(all.length)
  })

  it('every dimension-card tab id is the one the component actually holds', () => {
    // The silent-gate guard. A tab id that drifts from the component's own Tab
    // union makes CARD_TABS a list of intentions again, and the registry check
    // above starts agreeing with a screen that shows no glyph at all.
    //
    // It reads the card's `type Tab = 'a' | 'b' | …` union rather than grepping
    // for the literal anywhere in the file: `'utm_source'` occurs in Campaigns
    // as a FILTER DIMENSION, so a loose substring scan happily accepts the
    // wrong string. Exact set equality is what actually pins this.
    for (const [file, tabs] of Object.entries(CARD_TABS)) {
      const source = read(file)
      // A named union where the card declares one, else the inline union on
      // the tab useState (a card may keep its views inline).
      const union =
        source.match(/^type (?:Utm)?Tab = ([^\n]+)$/m)?.[1] ??
        source.match(/useState<((?:'[a-z_]+'(?:\s*\|\s*)?)+)>/)?.[1]
      expect(union, `${file}: no tab union found to check CARD_TABS against`).toBeTruthy()
      const declared = [...union!.matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
      expect(
        [...tabs].sort(),
        `${file}: CARD_TABS does not match the component's own Tab union`,
      ).toEqual([...declared].sort())
    }
  })

  it('every dimension-card tab resolves to a real registry entry', () => {
    // Coverage is all-or-none across a sibling set: a card with one bare tab
    // reads as a bug, not as a gap.
    const DELIBERATELY_BARE = new Set<string>()
    const bare: string[] = []
    for (const [file, tabs] of Object.entries(CARD_TABS)) {
      for (const tab of tabs) {
        const key = resolve(tab)
        if (!TERMS[key] && !DELIBERATELY_BARE.has(key)) bare.push(`${file} → "${tab}" (→ ${key})`)
      }
    }
    expect(bare, `card tabs that render no glyph: ${bare.join(', ')}`).toEqual([])
  })

  it('no card glyph is keyed on the rail metric any more', () => {
    // MetricUnitLabel used to render the glyph; that is what produced the
    // repetition. It must be a plain label again.
    const unit = read('components/dashboard/MetricRowStat.tsx')
    expect(unit).not.toContain('<MetricInfoTip')
  })

  it('no call site pins its own glyph size — one identity, estate-wide', () => {
    // The drift this guards against shipped on day one: the instrument pages
    // were wired with `glyphSize={12}` hours BEFORE the size decision moved
    // the component default to 14px bold, so "make the glyph findable" reached
    // only the dashboard — the one surface that passed no override. Two pages
    // (Performance, Uptime) rendered both sizes at once. A component default
    // governs exactly the call sites that don't pass the prop, so the fix is
    // structural: no source file may mention glyphSize at all.
    const offenders: string[] = []
    for (const file of sourceFiles(['components', 'app', 'lib'])) {
      if (read(file).includes('glyphSize')) offenders.push(file)
    }
    expect(
      offenders,
      `call sites pinning their own glyph size (the component owns identity): ${offenders.join(', ')}`,
    ).toEqual([])
  })

  it("facet's InfoTip is reached only through the registry wrappers", () => {
    // Every glyph goes through MetricInfoTip/DimensionInfoTip/TermInfoTip so
    // the registry gate and the one-identity rule cannot be bypassed by a
    // direct import handing the primitive its own copy or its own styling.
    const WRAPPER = 'components/dashboard/MetricInfoTip.tsx'
    const offenders: string[] = []
    for (const file of sourceFiles(['components', 'app', 'lib'])) {
      if (file === WRAPPER) continue
      const facetImport = read(file).match(/import\s*\{([^}]*)\}\s*from\s*'@ciphera-net\/facet'/)
      if (facetImport && /\bInfoTip\b/.test(facetImport[1])) offenders.push(file)
    }
    expect(
      offenders,
      `files importing facet's InfoTip directly instead of the registry wrappers: ${offenders.join(', ')}`,
    ).toEqual([])
  })

  it('the deck rail states its sentences through the registry, not its own copies', () => {
    const deck = read('components/dashboard/CommandDeck.tsx')
    // A literal sentence in METRICS[] would drift from the docs page the
    // moment either is edited; the rail must read from the one source.
    expect(deck).toContain('METRIC_TERMS.visitors.definition')
    expect(deck).not.toContain('People, not visits: a returning reader counts once')
    // And it must reach the reader as semantics, not as an unreachable title.
    expect(deck).toContain('aria-describedby={`deck-def-')
    expect(deck).not.toMatch(/title=\{m\.title\}/)
  })
})
