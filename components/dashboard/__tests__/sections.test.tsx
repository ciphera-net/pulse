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

  // M12 (owner pick A, W-M12-5): the header's right slot says so when the
  // server says the goal counts include imported days, and only then.
  it('says "incl. imported days" on the Events tab when the server says imported days are included', () => {
    const imported = { included: true, from: '2026-08-30', through: '2026-09-14', source: 'plausible', reason: null }
    render(<ContentSignals {...props} goalsImported={imported} />)
    // Not on the scroll tab: that slot is its session count.
    expect(screen.queryByText('incl. imported days')).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: 'Events' }))
    const word = screen.getByTestId('events-imported-word')
    expect(word.textContent).toBe('incl. imported days')
    expect(word.className).toContain('text-[11px]')
    expect(word.className).not.toContain('font-mono')
  })

  it('says nothing when the range holds no imported day, or they were left out (a filter)', () => {
    for (const goalsImported of [
      undefined,
      { included: false, from: null, through: null, source: null, reason: null },
      { included: false, from: '2026-08-30', through: '2026-09-14', source: 'plausible', reason: 'filtered' },
    ]) {
      const { unmount } = render(<ContentSignals {...props} goalsImported={goalsImported} />)
      fireEvent.click(screen.getByRole('radio', { name: 'Events' }))
      expect(screen.queryByTestId('events-imported-word')).toBeNull()
      unmount()
    }
  })
})
