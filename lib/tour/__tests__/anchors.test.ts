import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { TOUR_ANCHORS, DIMENSION_CARD_KEYS } from '@/lib/tour/anchors'

// ---------------------------------------------------------------------------
// The tour-anchor contract, enforced in BOTH directions.
//
// `data-tour` attributes are the product's stable selector promise — the
// guided tour targets them, and nothing else in the DOM is a contract (aria
// values and class strings change for their own reasons). Scanning the actual
// source (the conviction-lint precedent) catches what a props-level test
// cannot: an attribute deleted in a refactor, or a new anchor minted ad hoc
// that the registry — and therefore the tour — knows nothing about.
// ---------------------------------------------------------------------------

const ROOT = path.resolve(__dirname, '../../..')

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

function scanAttrs(attr: string): Map<string, string[]> {
  const found = new Map<string, string[]>()
  const re = new RegExp(`${attr}="([a-z0-9-]+)"`, 'g')
  for (const file of sourceFiles(['components', 'app'])) {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8')
    for (const m of src.matchAll(re)) {
      const list = found.get(m[1]) ?? []
      list.push(file)
      found.set(m[1], list)
    }
  }
  return found
}

describe('tour anchor contract', () => {
  const anchors = Object.values(TOUR_ANCHORS)
  const inSource = scanAttrs('data-tour')

  it('every registered anchor exists in product source', () => {
    const missing = anchors.filter((a) => !inSource.has(a))
    expect(
      missing,
      `registered anchors with no data-tour attribute in source (a tour step would target nothing): ${missing.join(', ')}`,
    ).toEqual([])
  })

  it('every data-tour attribute in source is a registered anchor', () => {
    const rogue = [...inSource.keys()].filter((a) => !anchors.includes(a as never))
    expect(
      rogue,
      `unregistered data-tour attributes (mint them in lib/tour/anchors.ts or remove them): ${rogue
        .map((a) => `"${a}" in ${inSource.get(a)!.join(', ')}`)
        .join(' · ')}`,
    ).toEqual([])
  })

  it('the six dimension cards each carry their data-tour-card key, and no others exist', () => {
    const cards = scanAttrs('data-tour-card')
    const missing = DIMENSION_CARD_KEYS.filter((k) => !cards.has(k))
    const rogue = [...cards.keys()].filter((k) => !DIMENSION_CARD_KEYS.includes(k as never))
    expect(missing, `dimension cards missing their key: ${missing.join(', ')}`).toEqual([])
    expect(rogue, `unregistered data-tour-card keys: ${rogue.join(', ')}`).toEqual([])
    // Exactly one card per key — a duplicated key would make a tour step's
    // target ambiguous.
    for (const k of DIMENSION_CARD_KEYS) {
      expect(cards.get(k)!.length, `data-tour-card="${k}" appears in more than one file`).toBe(1)
    }
  })

  it('anchor names are stable kebab-case tokens', () => {
    for (const a of anchors) {
      expect(a).toMatch(/^[a-z][a-z0-9-]*$/)
    }
  })
})
