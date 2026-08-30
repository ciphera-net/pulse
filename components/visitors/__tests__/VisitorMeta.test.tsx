import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { VisitorMeta } from '../VisitorMeta'
import { browserVendor, osVendor } from '../VisitorIcons'

/**
 * Pins §9a.4's fold rule and D7's absence rule — the two things about this line
 * that a reader would notice being wrong and a compiler would not.
 */

function marks(container: HTMLElement) {
  return container.querySelectorAll('img[src*="/api/favicon"], img[src*="/brands/"]')
}

describe('the meta line folds a shared vendor to ONE mark', () => {
  it('Safari + macOS render one Apple mark and the OS as text', () => {
    // Both resolve to apple.com, so two marks would print the SAME favicon
    // twice in a row — which reads as a rendering bug, not as information.
    expect(browserVendor('Safari')).toBe(osVendor('macOS'))
    const { container } = render(<VisitorMeta browser="Safari" os="macOS" />)
    expect(marks(container)).toHaveLength(1)
    expect(screen.getByText('Safari · macOS')).toBeInTheDocument()
  })

  it('Edge + Windows fold too — same vendor, same favicon', () => {
    expect(browserVendor('Edge')).toBe(osVendor('Windows'))
    const { container } = render(<VisitorMeta browser="Edge" os="Windows" />)
    expect(marks(container)).toHaveLength(1)
    expect(screen.getByText('Edge · Windows')).toBeInTheDocument()
  })

  it('Chrome + Windows keep TWO marks — the vendors genuinely differ', () => {
    expect(browserVendor('Chrome')).not.toBe(osVendor('Windows'))
    const { container } = render(<VisitorMeta browser="Chrome" os="Windows" />)
    expect(marks(container)).toHaveLength(2)
  })

  it('Firefox + Linux keep two marks', () => {
    const { container } = render(<VisitorMeta browser="Firefox" os="Linux" />)
    expect(marks(container)).toHaveLength(2)
  })

  it('an OS standing alone still carries its own mark, exactly once', () => {
    const { container } = render(<VisitorMeta os="Windows" />)
    expect(marks(container)).toHaveLength(1)
    expect(screen.getAllByText('Windows')).toHaveLength(1)
  })

  it('matches a versioned UA string, not just the bare name', () => {
    // The columns hold whatever the parser produced: "Mobile Safari", "Mac OS X".
    expect(browserVendor('Mobile Safari 17')).toBe('apple.com')
    expect(osVendor('Mac OS X')).toBe('apple.com')
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
