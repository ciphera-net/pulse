/**
 * Pulse's own tracking tag must keep outbound-link tracking OFF.
 *
 * Pulse tracks pulse.ciphera.net with its own tracker. Every customer works
 * inside that page, so an outbound click recorded here is a CUSTOMER's
 * destination — their own site's pages, and the sites they link out to —
 * landing in Ciphera's analytics. On 08-09-2026 fourteen such rows were found
 * and deleted, and the owner ruled the tag must stop producing them.
 * File downloads stay on: they resolve to Ciphera's own domains and carry no
 * customer destination.
 *
 * This is a source-text guard rather than a render test, and it has to be:
 * `next/script` injects the tag on the client, so it is absent from the
 * server HTML, and what is being protected is the attribute's presence — a
 * change that removes it produces no error, no failing render and no visible
 * difference. Its only symptom is data quietly reappearing.
 *
 * The guard strips comments first, so the prose above cannot satisfy it.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const raw = readFileSync(join(process.cwd(), 'app/layout.tsx'), 'utf8')

/** Source with every block and line comment removed, so only real code is asserted on. */
const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[^\n]*?\/\/[^\n]*$/gm, '')

describe("Pulse's own tracking tag", () => {
  it('strips comments before asserting (positive control)', () => {
    expect(raw).toContain('Outbound-link tracking is OFF')
    expect(code).not.toContain('Outbound-link tracking is OFF')
    expect(code).not.toContain('data-no-such-attribute')
  })

  it('carries data-no-outbound', () => {
    expect(code).toMatch(/data-no-outbound/)
  })

  it('sets data-no-outbound to a value next/script will actually render', () => {
    // * setAttributesFromProps drops a prop whose value is `undefined`, and for a
    // * SCRIPT element it sets-then-REMOVES an attribute whose value is `false`.
    // * Either form renders nothing at all, silently re-enabling the tracking.
    const match = /data-no-outbound(=\{?[^\s/>]*\}?)?/.exec(code)
    expect(match, 'data-no-outbound is not on the tag').not.toBeNull()
    const value = match![1] ?? ''
    expect(value, 'data-no-outbound must not be {false} or {undefined}').not.toMatch(
      /\{\s*(false|undefined)\s*\}/,
    )
  })

  it('leaves file-download tracking ON', () => {
    expect(code).not.toMatch(/data-no-downloads/)
  })

  it('still names the site it tracks', () => {
    expect(code).toContain('data-domain="pulse.ciphera.net"')
  })
})
