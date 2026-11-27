import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { Metadata } from 'next'
import { SHARE_CARDS, shareCardImages, shareCardTwitter, shareCardUrl, type ShareCardKey } from '@/lib/og'

/**
 * Every public page of this app shares a card in the marketing site's design (lib/og.ts): /demo, a share link and a
 * shared report carry their own, every other page the home page's. Crawlers read two sets of tags (Open Graph for
 * LinkedIn, Slack and most others, twitter:* for X), so each page names its card in both blocks. A page that declares
 * only `openGraph` inherits the root layout's whole `twitter` block, which is how /demo told X the site's title.
 */

// The root layout loads its fonts through next/font, which only Next's compiler can run.
vi.mock('next/font/google', () => ({
  Geist: () => ({ variable: 'font-geist' }),
  JetBrains_Mono: () => ({ variable: 'font-jetbrains-mono' }),
}))

function imageUrls(block: Metadata['openGraph'] | Metadata['twitter']): string[] {
  const list = (block as { images?: unknown } | null | undefined)?.images
  const items = Array.isArray(list) ? list : list ? [list] : []
  return items.map((i) => (typeof i === 'string' ? i : (i as { url: string }).url))
}

function expectCard(meta: Metadata, key: ShareCardKey) {
  expect(imageUrls(meta.openGraph), `${key}: openGraph`).toEqual([shareCardUrl(key)])
  expect(imageUrls(meta.twitter), `${key}: twitter`).toEqual([shareCardUrl(key)])
  expect((meta.twitter as { card?: string }).card, `${key}: twitter card`).toBe('summary_large_image')
}

describe('lib/og.ts', () => {
  it('names each drawn card on the CDN by its hash, once', () => {
    const files = Object.values(SHARE_CARDS).map((c) => c.file)
    for (const f of files) expect(f).toMatch(/^share\/[0-9a-f]{16}\.png$/)
    expect(new Set(files).size).toBe(files.length)
    for (const key of Object.keys(SHARE_CARDS) as ShareCardKey[]) {
      expect(shareCardUrl(key)).toBe(`https://cdn.ciphera.net/pulse/${SHARE_CARDS[key].file}`)
    }
  })

  it('keeps every word on a card free of dashes and curly quotes', () => {
    for (const [key, c] of Object.entries(SHARE_CARDS)) {
      expect(`${c.label} ${c.title} ${c.lead}`, key).not.toMatch(/[—–“”‘’]/)
    }
  })

  it('describes the card in its alt text and sizes it 1200x630', () => {
    expect(shareCardImages('demo')).toEqual([
      {
        url: shareCardUrl('demo'),
        width: 1200,
        height: 630,
        alt: "Live demo. Explore the Pulse Analytics dashboard with a sample shop's data.",
      },
    ])
    expect(shareCardImages('home')[0].alt).toBe(
      'Analytics without the surveillance. Privacy-first web analytics, with no cookies and no consent banner.'
    )
  })

  it("gives X the card, the card type, the site's handle and only the text it is given", () => {
    expect(shareCardTwitter('report')).toEqual({
      card: 'summary_large_image',
      site: '@CipheraNET',
      images: [
        { url: shareCardUrl('report'), alt: 'Report. This report was made with Pulse, privacy-first analytics by Ciphera.' },
      ],
    })
    expect(shareCardTwitter('home', { title: 'T' }).title).toBe('T')
  })
})

describe('every public page names its card in both blocks', () => {
  it('the root layout: the home card, for every page without a title of its own', async () => {
    const { metadata } = await import('@/app/layout')
    expectCard(metadata, 'home')
  })

  it("/demo and every page under it, with X's title left to Next to fill from openGraph", async () => {
    const { metadata } = await import('@/app/demo/layout')
    expectCard(metadata, 'demo')
    expect((metadata.twitter as { title?: unknown }).title).toBeUndefined()
  })

  it("a public share link, titled once (the root layout's template adds the brand)", async () => {
    const { metadata } = await import('@/app/share/[id]/layout')
    expectCard(metadata, 'share')
    expect(metadata.title).toBe('Public dashboard')
    expect((metadata.openGraph as { title?: unknown }).title).toBe('Public dashboard')
    expect(`${metadata.description}`).not.toMatch(/[—–]/)
  })

  it('a shared report, still with no og:url and no referrer', async () => {
    const { metadata } = await import('@/app/r/[token]/layout')
    expectCard(metadata, 'report')
    expect((metadata.openGraph as { url?: unknown }).url).toBeUndefined()
    expect(metadata.referrer).toBe('no-referrer')
  })
})

describe('app/', () => {
  /** Every .ts/.tsx file under app/, tests excluded. */
  function sources(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const path = join(dir, e.name)
      if (e.isDirectory()) return e.name === '__tests__' ? [] : sources(path)
      return /\.tsx?$/.test(e.name) ? [path] : []
    })
  }

  it('declares openGraph only next to twitter, both from lib/og.ts', () => {
    const app = join(process.cwd(), 'app')
    const declaring = sources(app).filter((f) => /\bopenGraph\s*:/.test(stripComments(readFileSync(f, 'utf8'))))
    expect(declaring.length).toBeGreaterThanOrEqual(4)
    for (const file of declaring) {
      const code = stripComments(readFileSync(file, 'utf8'))
      const name = relative(app, file)
      expect(code, `${name}: an openGraph block without a twitter block ships X the root layout's card and title`).toMatch(
        /\btwitter\s*:/
      )
      expect(code, `${name}: share cards come from lib/og.ts`).toMatch(/\bshareCardImages\(/)
      expect(code, `${name}: share cards come from lib/og.ts`).toMatch(/\bshareCardTwitter\(/)
    }
  })
})

/** The file without its comments, so prose cannot satisfy a check. */
function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
}
