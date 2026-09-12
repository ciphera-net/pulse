import { describe, it, expect } from 'vitest'
import { getIntegration, renderSnippet, SNIPPET_INTERACTIONS_TOKEN } from '@/lib/integrations'

/**
 * The interaction companion in each framework's own idiom (option B, owner
 * 11-09-2026).
 *
 * 🔑 These assert on RENDERED OUTPUT rather than on the templates, because the
 * templates are hand-written per platform and the only thing that matters is
 * what a customer pastes. The six were also read by eye once — there is no way
 * to check `next/script` or a Gatsby SSR array against the real framework from
 * here, so "it renders as valid idiom" is a human judgement backed by these
 * structural assertions.
 */

const ALL = ['nextjs', 'nuxt', 'astro', 'svelte', 'remix', 'gatsby'] as const
const COMPANION = 'script.interactions.js'

function render(id: (typeof ALL)[number], interactionFlags: string[] | null) {
  return renderSnippet(getIntegration(id)!.snippet!, 'example.com', [], interactionFlags)
}

describe('the companion slot', () => {
  it('every framework snippet carries the companion placeholder AND a block', () => {
    for (const id of ALL) {
      const s = getIntegration(id)!.snippet!
      expect(s.code, `${id} must carry the companion placeholder`).toContain(SNIPPET_INTERACTIONS_TOKEN)
      expect(s.interactions, `${id} must carry a companion block`).toBeTruthy()
    }
  })

  /**
   * 🔴 null ≠ []. `[]` is "companion on, every kind on"; `null` is "no companion
   * tag at all". Conflating them would put a second script on every site.
   */
  it('leaves the companion OUT for null, and IN for an empty flag list', () => {
    for (const id of ALL) {
      expect(render(id, null), `${id}: null must omit the companion`).not.toContain(COMPANION)
      expect(render(id, []), `${id}: [] must include it`).toContain(COMPANION)
    }
  })

  it('leaves no placeholder or stray blank line behind, either way', () => {
    for (const id of ALL) {
      for (const flags of [null, [], ['data-no-copy']] as const) {
        const out = render(id, flags as string[] | null)
        expect(out, `${id}`).not.toContain(SNIPPET_INTERACTIONS_TOKEN)
        expect(out, `${id}`).not.toContain('PULSE_FLAGS')
        expect(out, `${id} must not leave a blank indented line`).not.toMatch(/\n[ \t]+\n/)
      }
    }
  })

  /**
   * ⚠️ COUNTED, NOT SLICED. The first version of this test sliced the output
   * from the companion's `src` string and asserted no `data-domain` after it —
   * so a domain placed ABOVE the src, inside the same block, was invisible to
   * it. Mutation-testing put one there and the test stayed green.
   *
   * The core carries exactly one domain; the companion must add none. So the
   * total is 1 whether the companion is on or off, wherever the lines sit.
   */
  it('never gives the companion a data-domain — it reads nothing of its own', () => {
    for (const id of ALL) {
      const domains = (flags: string[] | null) =>
        (render(id, flags).match(/data-domain/g) ?? []).length
      expect(domains(null), `${id}: the core carries exactly one domain`).toBe(1)
      expect(domains([]), `${id}: the companion must add none`).toBe(1)
      expect(domains(['data-no-copy']), `${id}: still none with flags`).toBe(1)
    }
  })

  it('writes the per-kind opt-outs on the COMPANION, not on the core', () => {
    for (const id of ALL) {
      const out = renderSnippet(
        getIntegration(id)!.snippet!,
        'example.com',
        ['data-no-outbound'],          // a CORE flag
        ['data-no-copy'],              // a COMPANION flag
      )
      const coreAt = out.indexOf('script.js"')
      const compAt = out.indexOf(COMPANION)
      const outboundAt = out.indexOf('data-no-outbound')
      const copyAt = out.indexOf('data-no-copy')
      expect(compAt, `${id}: companion must be present`).toBeGreaterThan(-1)
      // The core flag belongs to the first block, the companion flag to the second.
      expect(outboundAt, `${id}: core flag must precede the companion`).toBeLessThan(compAt)
      expect(copyAt, `${id}: companion flag must sit after the core src`).toBeGreaterThan(coreAt)
    }
  })

  /**
   * 🔴 GATSBY'S REACT KEYS MUST DIFFER. Both scripts are elements of one
   * `setHeadComponents([...])` array, so a shared key is a duplicate-key warning
   * at best and a dropped script at worst — and it is the one platform where the
   * hazard exists at all.
   */
  it('gives gatsby’s two scripts distinct React keys', () => {
    const out = render('gatsby', [])
    const keys = [...out.matchAll(/key="([^"]+)"/g)].map((m) => m[1])
    expect(keys).toHaveLength(2)
    expect(new Set(keys).size, `duplicate key: ${keys.join(', ')}`).toBe(2)
  })

  it('writes nuxt’s companion as an OBJECT in the script array', () => {
    const out = render('nuxt', ['data-no-copy'])
    expect(out).toContain("{ defer: true, 'data-no-copy': '', src: 'https://js.ciphera.net/script.interactions.js' },")
    // two objects in the array, each with its own defer
    expect(out.split('defer: true,').length - 1).toBe(2)
  })

  it('keeps next/script’s strategy on the companion too', () => {
    const out = render('nextjs', [])
    const after = out.slice(out.indexOf(COMPANION))
    expect(after, 'a next/script tag without a strategy loads differently').toContain('strategy="afterInteractive"')
  })
})
