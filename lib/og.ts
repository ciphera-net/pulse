import type { Metadata } from 'next'

// * The share cards this app's public pages carry (since 27-11-2026; the design is the marketing site's, 08-11-2026).
// *
// * pulse.ciphera.net is two apps, and the marketing app (ciphera-net/pulse-website) draws every card for the
// * hostname with one renderer: its scripts/share-cards/render.ts draws a card's words over the tilted demo
// * dashboard, and the CDN serves the result at cdn.ciphera.net/pulse/share/<hash>.png, a name hashed from the
// * template, the capture and the words. Nothing here draws a card: this file names the drawn files and keeps
// * the words on each, which are also its alt text.
// *
// * - home: the marketing home page's own card. Every page here that carries the site's title (sign-in,
// *   sign-up, an invitation, the plan claims) shares it, as the home page does.
// * - demo, share, report: drawn for /demo, a public share link and a shared report, the pages with a title
// *   of their own. Their words are not in the marketing app's list: to change one, draw the new words with
// *   that renderer, upload the file to the CDN's pulse/share/ folder, and change the file and the words here
// *   together.
// *
// * A card on the CDN is never replaced or deleted (a new drawing is a new name), so every name here keeps
// * answering after the marketing app redraws its own cards.
// *
// * Every URL is absolute and never goes through cdnUrl(): the cards exist only on the CDN, and a relative
// * path would resolve against this app's origin, where /share/* is the public dashboard route.

const CARD_BASE = 'https://cdn.ciphera.net/pulse/'

interface ShareCard {
  /** The drawn file, under cdn.ciphera.net/pulse/. */
  file: string
  /** The words on the card: the footer column it sits in (none on home), its title and the line under it. */
  label: string
  title: string
  lead: string
}

const CARDS = {
  home: {
    file: 'share/26ba70ca9dfeb371.png',
    label: '',
    title: 'Analytics without the surveillance.',
    lead: 'Privacy-first web analytics, with no cookies and no consent banner.',
  },
  demo: {
    file: 'share/e9f5895ddb750f97.png',
    label: 'Product',
    title: 'Live demo',
    lead: "Explore the Pulse Analytics dashboard with a sample shop's data.",
  },
  share: {
    file: 'share/f24b47421b398aa3.png',
    label: '',
    title: 'Public dashboard',
    lead: "View this site's public stats.",
  },
  report: {
    file: 'share/ed3736427ec57e8c.png',
    label: '',
    title: 'Report',
    lead: 'This report was made with Pulse, privacy-first analytics by Ciphera.',
  },
} satisfies Record<string, ShareCard>

export type ShareCardKey = keyof typeof CARDS

/** Every card, for the tests. */
export const SHARE_CARDS: Readonly<Record<ShareCardKey, ShareCard>> = CARDS

/** What the card says, as its alt text: the title, then the line under it. */
function altText(card: ShareCard): string {
  return /[.!?]$/.test(card.title) ? `${card.title} ${card.lead}` : `${card.title}. ${card.lead}`
}

/** The card's absolute address. */
export function shareCardUrl(key: ShareCardKey): string {
  return `${CARD_BASE}${CARDS[key].file}`
}

/** A page's card for `openGraph.images`, 1200x630. */
export function shareCardImages(key: ShareCardKey) {
  return [{ url: shareCardUrl(key), width: 1200, height: 630, alt: altText(CARDS[key]) }]
}

/**
 * A page's `twitter` block. A page that declares one replaces the root layout's whole block, so the card type and
 * the site's handle come with it. Without a title or description of its own, Next fills both from the page's
 * `openGraph`, so pass them only where X should read something else.
 */
export function shareCardTwitter(
  key: ShareCardKey,
  text: { title?: string; description?: string } = {}
): NonNullable<Metadata['twitter']> {
  const [image] = shareCardImages(key)
  return { card: 'summary_large_image', site: '@CipheraNET', ...text, images: [{ url: image.url, alt: image.alt }] }
}
