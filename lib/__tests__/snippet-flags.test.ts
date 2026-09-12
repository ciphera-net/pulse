import { describe, it, expect } from 'vitest'
import {
  getIntegration,
  renderSnippet,
  SNIPPET_FLAG_TOKEN,
  SNIPPET_INTERACTIONS_TOKEN,
  integrations,
} from '@/lib/integrations'

/**
 * Until 11-09-2026 the install panel's own toggles did not reach the snippet it
 * showed you on any platform carrying framework-specific code.
 * `scriptSnippet` substituted only DOMAIN and dropped the `data-no-*` flags, so
 * turning "Outbound links" off on a Next.js site produced a `<Script>` with no
 * `data-no-outbound` — and the only thing that made the toggles work was
 * enabling SRI, which bypasses the framework path entirely.
 *
 * Six platforms were affected: nextjs, nuxt, astro, svelte, remix, gatsby.
 */

const FRAMEWORKS_WITH_CODE = ['nextjs', 'nuxt', 'astro', 'svelte', 'remix', 'gatsby'] as const
const ALL_FLAGS = ['data-no-scroll', 'data-no-outbound', 'data-no-downloads']

describe('the flag placeholder is structural, not a convention', () => {
  /**
   * 🔴 THE GUARD THAT MAKES THE ORIGINAL BUG IMPOSSIBLE RATHER THAN UNLIKELY.
   * A new framework snippet added without a placeholder would silently ignore
   * every toggle, exactly as the six did. This fails instead.
   */
  it('EVERY snippet that carries code carries the placeholder', () => {
    const offenders = integrations
      .filter((i) => i.snippet?.code)
      .filter((i) => !i.snippet!.code!.includes(SNIPPET_FLAG_TOKEN))
      .map((i) => i.id)
    expect(
      offenders,
      `these snippets would ignore every tracking toggle: ${offenders.join(', ')}`,
    ).toEqual([])
  })

  it('covers the six platforms the bug affected, and finds no others', () => {
    const withCode = integrations.filter((i) => i.snippet?.code).map((i) => i.id).sort()
    expect(withCode).toEqual([...FRAMEWORKS_WITH_CODE].sort())
  })

  /**
   * 🔴 THE PLACEMENT MATCHES THE STYLE. Block styles (`attr`/`object`) remove
   * the whole line, so their token must be ALONE on it or real code goes with
   * it. Inline styles remove ` PULSE_FLAGS` (token plus the one space before
   * it), so their token must sit between two attributes with a single space on
   * each side — a flagless tag then reads exactly as if the token were never
   * there. Since 12-09-2026 all six shipped snippets are inline (one-line tags).
   */
  it('places the placeholder the way its style removes it, in every snippet', () => {
    for (const i of integrations.filter((x) => x.snippet?.code)) {
      const inline = i.snippet!.flagStyle === 'inline' || i.snippet!.flagStyle === 'inline-object'
      const bad = i.snippet!.code!
        .split('\n')
        .filter((l) => l.includes(SNIPPET_FLAG_TOKEN))
        .filter((l) => (inline ? !l.includes(` ${SNIPPET_FLAG_TOKEN} `) : l.trim() !== SNIPPET_FLAG_TOKEN))
      expect(bad, `${i.id}: misplaced placeholder: ${bad.join(' | ')}`).toEqual([])
    }
  })

  it('ships every framework snippet with a one-line tag (inline style)', () => {
    for (const id of FRAMEWORKS_WITH_CODE) {
      const s = getIntegration(id)!.snippet!
      expect(s.flagStyle, `${id}`).toMatch(/^inline/)
      // The line that carries the core tag holds the domain, the token and the src.
      const tagLine = s.code!.split('\n').find((l) => l.includes('data-domain'))!
      expect(tagLine).toContain(SNIPPET_FLAG_TOKEN)
      expect(tagLine).toContain('script.js')
    }
  })

  it('carries the placeholder exactly once per snippet', () => {
    for (const id of FRAMEWORKS_WITH_CODE) {
      const code = getIntegration(id)!.snippet!.code!
      const n = code.split(SNIPPET_FLAG_TOKEN).length - 1
      expect(n, `${id} must carry exactly one placeholder`).toBe(1)
    }
  })
})

describe('renderSnippet', () => {
  it('removes the placeholder LINE when no flags are set', () => {
    for (const id of FRAMEWORKS_WITH_CODE) {
      const out = renderSnippet(getIntegration(id)!.snippet!, 'example.com', [])
      expect(out, `${id} must not leak the token`).not.toContain(SNIPPET_FLAG_TOKEN)
      // 🔑 The LINE goes, not just the token — a blank line left in the middle
      // of somebody's config is a diff they did not ask for.
      expect(out, `${id} must not leave a stray blank line`).not.toMatch(/\n[ \t]+\n/)
      expect(out).toContain('example.com')
    }
  })

  it('writes attributes for the five tag-shaped snippets', () => {
    for (const id of ['nextjs', 'astro', 'svelte', 'remix', 'gatsby'] as const) {
      const out = renderSnippet(getIntegration(id)!.snippet!, 'example.com', ALL_FLAGS)
      for (const f of ALL_FLAGS) expect(out, `${id} must carry ${f}`).toContain(f)
      // attribute syntax, NOT object syntax
      expect(out, `${id} is tag-shaped`).not.toContain("'data-no-outbound':")
    }
  })

  /**
   * 🔴 nuxt's script is an OBJECT LITERAL, not a tag. A regex that injected
   * bare attributes here would emit `data-no-outbound` inside an object — valid
   * enough to paste and broken enough to never notice.
   */
  it('writes OBJECT ENTRIES for nuxt, whose script is a config object', () => {
    const out = renderSnippet(getIntegration('nuxt')!.snippet!, 'example.com', ALL_FLAGS)
    expect(out).toContain("'data-no-outbound': '',")
    expect(out).toContain("'data-no-scroll': '',")
    // and never the bare attribute form
    expect(out).not.toMatch(/^\s*data-no-outbound\s*$/m)
  })

  it('writes the flags inline, between the attributes, on the tag line', () => {
    const next = renderSnippet(getIntegration('nextjs')!.snippet!, 'example.com', ['data-no-scroll', 'data-no-outbound'])
    expect(next).toContain('data-domain="example.com" data-no-scroll data-no-outbound src="https://js.ciphera.net/script.js"')
    const astro = renderSnippet(getIntegration('astro')!.snippet!, 'example.com', ['data-no-scroll'])
    expect(astro).toContain('<script defer data-domain="example.com" data-no-scroll src="https://js.ciphera.net/script.js"></script>')
    const nuxt = renderSnippet(getIntegration('nuxt')!.snippet!, 'example.com', ['data-no-scroll'])
    expect(nuxt).toContain("'data-domain': 'example.com', 'data-no-scroll': '', src: 'https://js.ciphera.net/script.js' }")
  })

  it('leaves no double space where a flagless token was', () => {
    for (const id of FRAMEWORKS_WITH_CODE) {
      const out = renderSnippet(getIntegration(id)!.snippet!, 'example.com', [])
      expect(out, `${id}`).not.toMatch(/\S  \S/)
    }
  })

  it('keeps the snippet otherwise byte-identical', () => {
    // The only difference between "no flags" and the old behaviour must be the
    // placeholder line — nothing else about somebody's config may move.
    for (const id of FRAMEWORKS_WITH_CODE) {
      const code = getIntegration(id)!.snippet!.code!
      // Both placeholder lines vanish: no flags, and no companion.
      const expected = code
        .split('\n')
        .filter((l) => !l.includes(SNIPPET_INTERACTIONS_TOKEN))
        .filter((l) => !(l.trim() === SNIPPET_FLAG_TOKEN)) // a block-style token line
        .map((l) => l.replace(` ${SNIPPET_FLAG_TOKEN}`, '')) // an inline token
        .join('\n')
        .replace(/DOMAIN/g, 'example.com')
      expect(renderSnippet(getIntegration(id)!.snippet!, 'example.com', [])).toBe(expected)
    }
  })

  it('substitutes every DOMAIN occurrence, not just the first', () => {
    // The placeholder is on its OWN line — see the guard below. Written inline
    // it would be removed along with the code sharing its line, which is how
    // the first version of this test failed and why that guard now exists.
    const out = renderSnippet({ code: 'a=DOMAIN b=DOMAIN\n  PULSE_FLAGS' }, 'x.test', [])
    expect(out).toBe('a=x.test b=x.test')
  })

  it('returns the code unchanged when a snippet has no placeholder', () => {
    expect(renderSnippet({ code: '<script src="s"></script>' }, 'x.test', ['data-no-scroll']))
      .toBe('<script src="s"></script>')
  })
})
