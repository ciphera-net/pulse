import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { METRIC_TERMS, TERMS, UPTIME_TERM, glossaryHref } from '@/lib/dashboard/glossary'
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

describe('glossary registry', () => {
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

  it('every published anchor is a slug, and unpublished terms carry no link', () => {
    for (const term of [...Object.values(METRIC_TERMS), ...Object.values(TERMS)]) {
      const href = glossaryHref(term)
      if (term.anchor) {
        expect(term.anchor).toMatch(/^[a-z0-9-]+$/)
        expect(href).toBe(`https://help.ciphera.net/glossary#${term.anchor}`)
      } else {
        expect(href).toBeUndefined()
      }
    }
  })

  it('the deck rail states its sentences through the registry, not its own copies', () => {
    const deck = read('components/dashboard/CommandDeck.tsx')
    // A literal sentence in METRICS[] would drift from the glossary page the
    // moment either is edited; the rail must read from the one source.
    expect(deck).toContain('METRIC_TERMS.visitors.definition')
    expect(deck).not.toContain('A session lasts one UTC day')
    // And it must reach the reader as semantics, not as an unreachable title.
    expect(deck).toContain('aria-describedby={`deck-def-')
    expect(deck).not.toMatch(/title=\{m\.title\}/)
  })
})
