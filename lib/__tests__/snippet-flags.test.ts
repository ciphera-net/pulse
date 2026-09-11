import { describe, it, expect } from 'vitest'
import {
  getIntegration,
  renderSnippet,
  SNIPPET_FLAG_TOKEN,
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
   * 🔴 ALONE ON ITS LINE. `renderSnippet` removes the whole line so a flagless
   * snippet stays byte-identical — so a token sharing a line with real code
   * would silently delete that code. Found by a test that put it inline.
   */
  it('puts the placeholder alone on its line, in every snippet', () => {
    for (const i of integrations.filter((x) => x.snippet?.code)) {
      const bad = i.snippet!.code!
        .split('\n')
        .filter((l) => l.includes(SNIPPET_FLAG_TOKEN) && l.trim() !== SNIPPET_FLAG_TOKEN)
      expect(bad, `${i.id}: the placeholder shares a line with code: ${bad.join(' | ')}`).toEqual([])
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

  it('indents the flags to the placeholder’s own column', () => {
    // nextjs sits 10 deep inside the JSX; astro 6 inside the HTML.
    const next = renderSnippet(getIntegration('nextjs')!.snippet!, 'example.com', ['data-no-scroll'])
    expect(next).toContain('\n          data-no-scroll\n')
    const astro = renderSnippet(getIntegration('astro')!.snippet!, 'example.com', ['data-no-scroll'])
    expect(astro).toContain('\n      data-no-scroll\n')
  })

  it('keeps the snippet otherwise byte-identical', () => {
    // The only difference between "no flags" and the old behaviour must be the
    // placeholder line — nothing else about somebody's config may move.
    for (const id of FRAMEWORKS_WITH_CODE) {
      const code = getIntegration(id)!.snippet!.code!
      const expected = code
        .split('\n')
        .filter((l) => !l.includes(SNIPPET_FLAG_TOKEN))
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
