/**
 * Registry invariants for `snippet.unsupported` — the explicit "this platform
 * forbids custom scripts" flag.
 *
 * The flag exists because every signal that CORRELATES with impossibility also
 * covers platforms that install fine:
 *   - missing `snippet.code`      → ~60 platforms use the universal tag
 *   - `special-handling` tier     → Shopify, Framer, GTM, every headless CMS
 *   - `custom-code-plan-gated`    → Webflow, Squarespace, Wix, Carrd, Bubble…
 * Inferring from any of them would strip the install tag from working
 * platforms, so these tests pin the flag as the ONLY signal, and pin the two
 * module-load guards that keep it honest.
 */
import { describe, it, expect } from 'vitest'
import { integrations, isInstallUnsupported, type Integration } from '@/lib/integrations'

const flagged = integrations.filter(isInstallUnsupported)

describe('snippet.unsupported', () => {
  it('marks exactly the platforms that forbid custom script injection', () => {
    expect(flagged.map((i) => i.id).sort()).toEqual(['amp', 'linktree', 'notion', 'substack'])
  })

  it('never ships alongside install code — the contradiction the flag prevents', () => {
    for (const i of flagged) expect(i.snippet?.code).toBeUndefined()
  })

  it('always carries a note, so the guide is never left with nothing to say', () => {
    for (const i of flagged) expect(i.snippet?.note).toBeTruthy()
  })

  it('is not inferable from a missing snippet.code', () => {
    const noCode = integrations.filter((i) => !i.snippet?.code)
    expect(noCode.length).toBeGreaterThan(flagged.length)
    // The overwhelming majority of code-less platforms install perfectly well.
    expect(noCode.filter((i) => !isInstallUnsupported(i)).length).toBeGreaterThan(50)
  })

  it('is not inferable from the support tier', () => {
    const special = integrations.filter((i) => i.supportTier === 'special-handling')
    expect(special.filter((i) => !isInstallUnsupported(i)).map((i) => i.id)).toContain('strapi')
    expect(special.length).toBeGreaterThan(flagged.length)
  })

  it('is not inferable from the install method', () => {
    const planGatedCode = integrations.filter(
      (i) => i.installMethod === 'custom-code-plan-gated' && !isInstallUnsupported(i),
    )
    // Webflow/Squarespace/Wix need a paid plan — awkward, not impossible.
    expect(planGatedCode.map((i) => i.id)).toEqual(
      expect.arrayContaining(['webflow', 'squarespace', 'wix']),
    )
  })

  it('reads the flag rather than the note prose', () => {
    // A note is not a signal: plenty of installable platforms have one.
    const noted = integrations.filter((i) => i.snippet?.note && !isInstallUnsupported(i))
    expect(noted.length).toBeGreaterThan(10)
  })

  it('defaults to false for anything without the flag', () => {
    const fake = { snippet: { label: 'x' } } as unknown as Integration
    expect(isInstallUnsupported(fake)).toBe(false)
    expect(isInstallUnsupported({ snippet: null } as unknown as Integration)).toBe(false)
  })
})
