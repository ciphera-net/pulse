import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import SectionHeader from '@/components/dashboard/SectionHeader'
import ContentSignals from '@/components/dashboard/ContentSignals'
// ContentSignals fetches the scroll tab's page capture; pin it to "absent"
// here so these tests exercise the rails rendering deterministically.
vi.mock('@/lib/swr/dashboard', () => ({
  usePagePreview: () => ({ data: null }),
}))


describe('SectionHeader', () => {
  // 🔴 The provenance note was removed 10-09-2026 (owner: "get rid of whole
  // site & site timezone from on top right of all the blocks... its
  // unnecessary"). The header is a title and nothing else now — the one card
  // whose scope genuinely differs from its neighbours, Outbound, says so in its
  // own footnote, and only when a page filter is actually on.
  it('renders the title, and nothing beside it', () => {
    const { container } = render(<SectionHeader title="Acquisition" />)
    expect(screen.getByRole('heading', { name: 'Acquisition' })).toBeTruthy()
    expect(container.textContent).toBe('Acquisition')
    expect(container.querySelectorAll('span')).toHaveLength(0)
  })
})

describe('ContentSignals', () => {
  const props = {
    scrollDepth: { total_sessions: 129, scroll_25: 117, scroll_50: 92, scroll_75: 68, scroll_100: 36 },
    goalCounts: [{ event_name: 'signup', count: 30 }],
    siteId: 'site-1',
    dateRange: { start: '2026-07-20', end: '2026-08-18' },
  }

  it('defaults to scroll depth with the session count and COMPUTED percentages', () => {
    render(<ContentSignals {...props} />)
    expect(screen.getByText('129 sessions')).toBeTruthy()
    // The computed values, not the static threshold labels (review finding:
    // asserting '25%' matched the row LABEL and a broken calc stayed green):
    // 117/129 = 91%, 92/129 = 71%, 68/129 = 53%, 36/129 = 28%.
    for (const pct of ['91%', '71%', '53%', '28%']) {
      expect(screen.getByText(pct)).toBeTruthy()
    }
  })

  it('switches to events on its tab — counts only, no percentages', () => {
    render(<ContentSignals {...props} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Events' }))
    expect(screen.getByText('30')).toBeTruthy()
    expect(screen.queryByText(/\d+%/)).toBeNull()
    // The scroll session count belongs to the scroll tab's header only.
    expect(screen.queryByText('129 sessions')).toBeNull()
  })
})
