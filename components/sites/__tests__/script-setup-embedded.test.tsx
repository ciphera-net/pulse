// Round two, P1 (17-09-2026): inside Site · General the tracking block is part
// of the panel, not a card inside it, and its tier reads as the house chip.
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ScriptSetupBlock from '@/components/sites/ScriptSetupBlock'

vi.mock('@/lib/swr/dashboard', () => ({
  useInstallStatus: () => ({ data: { install_status: 'active' }, isLoading: false }),
}))

const site = { domain: 'example.com', name: 'Example', script_features: { scroll: true }, detected_framework: 'nextjs' }

describe('ScriptSetupBlock inside a settings panel', () => {
  it('draws no card around Customize tracking when embedded, and keeps one when not', () => {
    const { rerender } = render(<ScriptSetupBlock site={site} siteId="s1" embedded />)
    const tokens = (el: HTMLElement) => el.className.split(/\s+/)
    const block = screen.getByText('Customize tracking').parentElement as HTMLElement
    expect(tokens(block)).toContain('border-t')
    expect(tokens(block)).not.toContain('border')
    expect(tokens(block)).toContain('-mx-5')
    rerender(<ScriptSetupBlock site={site} siteId="s1" />)
    const plain = screen.getByText('Customize tracking').parentElement as HTMLElement
    expect(tokens(plain)).toContain('border')
    expect(tokens(plain)).not.toContain('-mx-5')
  })

  it('names the tier with the house chip (dot + sentence-case word), not an uppercase outline', () => {
    render(<ScriptSetupBlock site={site} siteId="s1" embedded />)
    const chips = screen.getAllByText(/^Verified$/i).map((el) => el.closest('span.inline-flex') as HTMLElement | null).filter(Boolean) as HTMLElement[]
    expect(chips.length).toBeGreaterThan(0)
    for (const root of chips) {
      expect(root.className).not.toMatch(/uppercase/)
      expect(root.querySelector('.rounded-full')).not.toBeNull()
    }
  })
})
