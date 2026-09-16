/**
 * Registry invariants for `installMethod: 'plugin'`.
 *
 * 🔴 Why this file exists. Both renderers — the marketing page
 * (`app/integrations/[slug]/page.tsx`) and the in-app `ScriptSetupBlock` —
 * branch on `installMethod === 'plugin'` and then show ONLY
 * `snippet.note` + `snippet.cta`, hiding the code block entirely.
 *
 * So a plugin entry with no `snippet` renders an EMPTY CARD: no install
 * instructions, no link, no error, nothing that fails a build or a type check.
 * That is exactly what `docusaurus` would have shipped on 16-09-2026 — it was
 * flipped to 'plugin' while having no entry in the snippet map at all, and only
 * a by-hand read of the render branch caught it.
 *
 * The note is load-bearing: for an npm-installed integration it is the only
 * place the install command appears.
 */
import { describe, it, expect } from 'vitest'
import { integrations } from '@/lib/integrations'

const plugins = integrations.filter((i) => i.installMethod === 'plugin')

describe("installMethod: 'plugin'", () => {
  it('is set on exactly the integrations that have a published, installable plugin', () => {
    // 🔴 Joomla is deliberately ABSENT until JED listing 17699 is public, and
    // GTM uses its own 'gtm-tag' method. Adding an id here without a live
    // listing documents an install path a stranger cannot follow.
    expect(plugins.map((i) => i.id).sort()).toEqual(
      ['astro', 'docusaurus', 'drupal', 'framer', 'woocommerce', 'wordpress'].sort(),
    )
  })

  it('always carries a note — the ONLY text either renderer shows', () => {
    for (const i of plugins) {
      expect(i.snippet?.note, `${i.id} has no snippet.note and would render an empty card`).toBeTruthy()
    }
  })

  it('always carries a cta, so the card is never a dead end', () => {
    for (const i of plugins) {
      expect(i.snippet?.cta?.url, `${i.id} has no snippet.cta.url`).toBeTruthy()
      expect(i.snippet?.cta?.text, `${i.id} has no snippet.cta.text`).toBeTruthy()
      expect(i.snippet?.cta?.url).toMatch(/^https:\/\//)
    }
  })

  it('names the install command for the ones installed from a package manager', () => {
    // These three are not one-click marketplaces: the command IS the instruction.
    const commands: Record<string, RegExp> = {
      astro: /@ciphera-net\/pulse-astro/,
      docusaurus: /@ciphera-net\/pulse-docusaurus/,
      drupal: /composer require drupal\/pulse_analytics/,
    }
    for (const [id, re] of Object.entries(commands)) {
      const note = integrations.find((i) => i.id === id)?.snippet?.note ?? ''
      expect(note, `${id}'s note must carry its install command`).toMatch(re)
    }
  })
})
