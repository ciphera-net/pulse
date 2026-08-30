import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { VisitorMeta } from '../VisitorMeta'

/**
 * 🔴 THE ONE THING THIS FILE EXISTS FOR: the Visitors meta line must draw the
 * SAME artwork the rest of Pulse draws.
 *
 * The first version resolved browsers and operating systems through
 * `/api/favicon?domain=…` — each vendor's own website favicon, at whatever
 * aspect ratio that vendor happens to use, and not the icons the Dashboard
 * shows for the same browser. The owner spotted it immediately: some were
 * rectangular, none matched the dashboard. These tests pin the source, so a
 * second icon system cannot creep back in.
 */

const HOUSE_BROWSER_ICON = /\/icons\/browsers\//
const HOUSE_OS_ICON = /\/icons\/os\//
const FAVICON_PROXY = /\/api\/favicon/

function imgSrcs(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('img')).map((i) => i.getAttribute('src') ?? '')
}

describe('icons come from the house registry, not from website favicons', () => {
  it('a browser draws the registry SVG the dashboard draws', () => {
    const { container } = render(<VisitorMeta browser="Firefox" />)
    expect(imgSrcs(container).some((s) => HOUSE_BROWSER_ICON.test(s))).toBe(true)
  })

  it('an OS draws the registry icon', () => {
    const { container } = render(<VisitorMeta os="Windows" />)
    expect(imgSrcs(container).some((s) => HOUSE_OS_ICON.test(s))).toBe(true)
  })

  it('NOTHING in the meta line resolves a browser or OS through the favicon proxy', () => {
    // The proxy is right for an arbitrary referrer domain we have no artwork
    // for. It is wrong for a browser or an OS, where a curated icon exists.
    const { container } = render(
      <VisitorMeta country="BE" browser="Safari" os="macOS" deviceType="desktop" />,
    )
    expect(imgSrcs(container).some((s) => FAVICON_PROXY.test(s))).toBe(false)
  })

  it('Safari and macOS BOTH draw a mark — they are different artwork here', () => {
    // The approved mock folded these to one, because with favicons the second
    // was a byte-identical duplicate (both apple.com). Against the registry
    // they are the Safari compass and the Apple mark — the pair the Dashboard
    // shows — so both belong.
    const { container } = render(<VisitorMeta browser="Safari" os="macOS" />)
    const srcs = imgSrcs(container)
    expect(srcs.some((s) => HOUSE_BROWSER_ICON.test(s))).toBe(true)
    expect(srcs.some((s) => HOUSE_OS_ICON.test(s))).toBe(true)
  })

  it('a referrer uses the REGISTRY display name, not a local lookup table', () => {
    // Asserted against the registry's own answer rather than a name this file
    // would prefer: the point is that the roster says whatever the Dashboard
    // says about the same referrer. A local table that disagreed prettily would
    // be the icon bug again, one layer down.
    render(<VisitorMeta referrer="https://www.google.com/" collectsReferrers />)
    expect(screen.getByText('Google')).toBeInTheDocument()
  })
})

describe('absence is absence, never a placeholder (D7)', () => {
  it('omits a segment entirely when its value is null', () => {
    // A site that does not collect device info must not get "Unknown" — that
    // would assert something about the visitor the site chose not to learn.
    render(<VisitorMeta country="BE" browser={null} os={null} deviceType={null} referrer={null} />)
    expect(screen.queryByText(/Unknown/)).toBeNull()
  })

  it('renders nothing at all when the site collects none of it', () => {
    const { container } = render(<VisitorMeta />)
    expect(container.firstChild).toBeNull()
  })

  it('"via Direct" shows for a direct visit on a site that DOES collect referrers', () => {
    render(<VisitorMeta referrer={null} collectsReferrers />)
    expect(screen.getByText('Direct')).toBeInTheDocument()
  })

  it('but NOT on a site that collects no referrers — that would be a fabrication', () => {
    // 🔴 The same null on the wire means two different things. Telling a site
    // that collects no referrers that every reader came direct is inventing a
    // fact it deliberately chose not to gather.
    render(<VisitorMeta referrer={null} collectsReferrers={false} />)
    expect(screen.queryByText('Direct')).toBeNull()
  })
})

describe('the device segment names itself', () => {
  it.each([
    ['desktop', 'Desktop'],
    ['mobile', 'Mobile'],
    ['tablet', 'Tablet'],
  ])('%s renders its glyph AND the word %s', (stored, shown) => {
    // A monitor outline alone is a rebus — and at 16px the phone and tablet
    // glyphs are a coin toss. Every other segment pairs a mark with a word.
    render(<VisitorMeta deviceType={stored} />)
    expect(screen.getByText(shown)).toBeInTheDocument()
  })
})

describe('favicons come from Sigil, flags from the flag helper', () => {
  it('an uncurated referrer domain resolves through the Sigil proxy', () => {
    // /api/favicon is the app's same-origin proxy in front of Sigil
    // (icons.ciphera.net). It is how this product resolves a favicon — never a
    // third-party service and never a guessed asset path.
    const { container } = render(
      <VisitorMeta referrer="https://some-blog.example.org/post" collectsReferrers />,
    )
    const srcs = Array.from(container.querySelectorAll('img')).map((i) => i.getAttribute('src') ?? '')
    expect(srcs.some((s) => s.startsWith('/api/favicon?domain='))).toBe(true)
  })

  it('a curated referrer uses the house brand icon instead, like the Dashboard', () => {
    const { container } = render(<VisitorMeta referrer="https://www.google.com/" collectsReferrers />)
    const srcs = Array.from(container.querySelectorAll('img')).map((i) => i.getAttribute('src') ?? '')
    expect(srcs.some((s) => s.includes('/icons/brands/'))).toBe(true)
  })

  it('a country draws the CDN flag set — Sigil serves favicons, not flags (it 404s)', () => {
    const { container } = render(<VisitorMeta country="BE" />)
    const srcs = Array.from(container.querySelectorAll('img')).map((i) => i.getAttribute('src') ?? '')
    expect(srcs.some((s) => s.includes('/flags/be.svg'))).toBe(true)
  })
})
