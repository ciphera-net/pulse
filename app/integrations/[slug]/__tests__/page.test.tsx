/**
 * The install guide must never contradict itself.
 *
 * Four platforms (substack / linktree / notion / amp) carry a note that says
 * the Pulse tag CANNOT be added there. The page used to print the generic
 * universal script tag underneath that note, because `renderSnippet` fell back
 * to it whenever `snippet.code` was absent — and absence of `code` is the
 * normal state for ~60 platforms that install perfectly well via a head
 * snippet. So the fallback was right in general and catastrophic for those
 * four: "you cannot install this" directly above a copy-paste install block.
 *
 * These tests pin both halves of the fix: the flagged platforms lose the
 * install block entirely, and every platform that CAN install keeps the exact
 * block it had before.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import IntegrationGuidePage from '../page'
import { integrations, isInstallUnsupported } from '@/lib/integrations'

const UNIVERSAL_TAG = 'https://js.ciphera.net/script.js'

/** The page is an async server component — await it, then render the tree. */
async function renderGuide(slug: string) {
  const ui = await IntegrationGuidePage({ params: Promise.resolve({ slug }) })
  return render(ui)
}

describe('install guide — platforms that cannot run the tag', () => {
  const unsupportedIds = integrations.filter(isInstallUnsupported).map((i) => i.id)

  it('flags exactly the four platforms that forbid custom scripts', () => {
    expect([...unsupportedIds].sort()).toEqual(['amp', 'linktree', 'notion', 'substack'])
  })

  it.each(['substack', 'linktree', 'notion', 'amp'])(
    '%s renders the honest note and NO install block',
    async (slug) => {
      const { container } = await renderGuide(slug)

      // The note survives — it is the whole point of the page.
      const note = integrations.find((i) => i.id === slug)?.snippet?.note
      expect(note).toBeTruthy()
      expect(screen.getByText(note as string)).toBeInTheDocument()
      expect(screen.getByText('Not supported')).toBeInTheDocument()

      // ...and nothing that looks like an install path accompanies it.
      expect(container.querySelector('pre')).toBeNull()
      expect(container.textContent).not.toContain(UNIVERSAL_TAG)
      expect(container.textContent).not.toContain('data-domain')
    },
  )
})

describe('install guide — platforms that can run the tag are untouched', () => {
  it('a platform with no bespoke code still gets the universal tag (ghost)', async () => {
    const { container } = await renderGuide('ghost')
    const pre = container.querySelector('pre')
    expect(pre).not.toBeNull()
    expect(pre?.textContent).toContain(UNIVERSAL_TAG)
    expect(pre?.textContent).toContain('data-domain="example.com"')
    expect(screen.queryByText('Not supported')).not.toBeInTheDocument()
  })

  it('the control case: same tier, same missing code, still installable (strapi)', async () => {
    // ! This is the test that stops the fix from being re-derived from the
    // ! wrong signal. Strapi is `special-handling` with a note and no
    // ! `snippet.code` — identical on every axis the four flagged platforms
    // ! share EXCEPT the explicit flag. It must keep its universal tag, and it
    // ! must keep the "Before you start" framing rather than "Not supported".
    const strapi = integrations.find((i) => i.id === 'strapi')
    expect(strapi?.supportTier).toBe('special-handling')
    expect(strapi?.snippet?.code).toBeUndefined()
    expect(isInstallUnsupported(strapi!)).toBe(false)

    const { container } = await renderGuide('strapi')
    expect(container.querySelector('pre')?.textContent).toContain(UNIVERSAL_TAG)
    expect(screen.getByText('Before you start')).toBeInTheDocument()
    expect(screen.queryByText('Not supported')).not.toBeInTheDocument()
  })

  it('a platform with bespoke code still renders that code (nextjs)', async () => {
    const { container } = await renderGuide('nextjs')
    const pre = container.querySelector('pre')
    expect(pre?.textContent).toContain("import Script from 'next/script'")
    expect(pre?.textContent).toContain('data-domain="example.com"')
    expect(container.textContent).toContain('Set ')
  })

  it('a plugin platform still renders its CTA, not a snippet (wordpress)', async () => {
    const { container } = await renderGuide('wordpress')
    expect(container.querySelector('pre')).toBeNull()
    expect(screen.getByText('Install Plugin')).toBeInTheDocument()
  })

  it('every platform that is not flagged still shows an install block', async () => {
    // The guard must be keyed on the explicit flag, not on anything that
    // happens to correlate with it (missing code, tier, install method).
    const installable = integrations.filter((i) => !isInstallUnsupported(i))
    expect(installable.length).toBeGreaterThan(60)
    for (const integration of installable.slice(0, 12)) {
      const { container, unmount } = await renderGuide(integration.id)
      expect(container.textContent).toContain('data-domain')
      unmount()
    }
  })
})
