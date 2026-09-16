import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 🔴 FRAMING NEEDS PERMISSION ON BOTH SIDES, AND MISSING EITHER IS SILENT.
 *
 * `frame-ancestors` on id.ciphera.net says who may frame IT. `frame-src` here
 * says what a Pulse page may frame. The vault-key hand-off needs both, and a
 * blocked frame does not error — it simply never loads, so the hand-off times
 * out and the person gets a password prompt with nothing in any log to say why.
 *
 * Measured 10-09-2026: with the identity provider correctly relaxed and its
 * allowlist correctly served, the hand-off still failed for exactly this
 * reason. The design named only the first half.
 *
 * Source-text because the CSP is assembled at build time in next.config.ts and
 * there is no runtime seam to ask.
 */
const CONFIG = readFileSync(join(__dirname, '../../next.config.ts'), 'utf8')

const frameSrc = (): string =>
  CONFIG.split('\n').find((l) => l.includes('"frame-src')) ?? ''

describe('the CSP lets Pulse frame what it has to', () => {
  it('names the identity provider — the vault-key bridge lives there', () => {
    expect(frameSrc()).toContain('https://id.ciphera.net')
  })

  it('keeps the support widget it already framed', () => {
    expect(frameSrc()).toContain('https://api.help.ciphera.net')
  })

  // ⚠️ frame-src is an allowlist of what this app may EMBED. A wildcard would
  // let any compromised script embed anything and phish inside our own chrome.
  it('is a list of origins, never a wildcard', () => {
    const line = frameSrc()
    expect(line).not.toMatch(/frame-src[^"]*\*/)
    expect(line).not.toContain("'unsafe")
  })
})
