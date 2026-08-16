import { describe, it, expect } from 'vitest'

import { metadata } from '../[id]/layout'

// The share page is a customer's dashboard behind a guessable-if-leaked URL. Two
// directives govern whether it lands in a search index, and before 16-08-2026 they
// DISAGREED: app/robots.ts sent `Disallow: /share/` while the page itself emitted the
// app's default `<meta name="robots" content="index, follow">`.
//
// robots.txt is an instruction only well-behaved crawlers follow. Anything that
// fetched the page regardless — an archiver, a link-preview bot, a crawler ignoring
// robots.txt — was being told, by the page, to index it. The meta tag is the half
// that binds whoever is already reading.
describe('share dashboard metadata', () => {
  it('tells crawlers not to index a customer dashboard', () => {
    expect(metadata.robots).toBeDefined()
    const robots = metadata.robots as { index?: boolean; follow?: boolean }
    expect(robots.index).toBe(false)
    expect(robots.follow).toBe(false)
  })

  it('still carries a social card, which is a different question from indexing', () => {
    // noindex must not be achieved by stripping metadata: /demo links here and the
    // unfurl is the card people see. Suppressing indexing and suppressing the
    // preview are separate decisions and only the first one was made.
    expect(metadata.openGraph?.title).toBeTruthy()
    expect(metadata.title).toBeTruthy()
  })
})
