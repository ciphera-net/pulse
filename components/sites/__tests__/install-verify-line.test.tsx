import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import ScriptSetupBlock from '@/components/sites/ScriptSetupBlock'

// Pins closeout ruling 6A: InstallVerify renders as a STATUS LINE in the
// SyncStatusLine grammar — colour in the dot and at most one word — never as
// the tinted alert panels it replaced (the estate's last holdout of that
// idiom). The deny direction is asserted explicitly: reintroducing a tinted
// panel background fails these tests.

const mockInstall = vi.fn()
vi.mock('@/lib/swr/dashboard', () => ({
  useInstallStatus: () => mockInstall(),
}))

const renderBlock = () =>
  render(<ScriptSetupBlock site={{ domain: 'example.com' }} siteId="s1" />)

beforeEach(() => {
  cleanup()
  mockInstall.mockReset()
})

describe('InstallVerify status line (ruling 6A)', () => {
  it('stalled: amber word + neutral line + guide link, no tinted panel', () => {
    mockInstall.mockReturnValue({
      data: { install_status: 'stalled', last_event_at: new Date(Date.now() - 3 * 864e5).toISOString() },
      isLoading: false,
    })
    const { container } = renderBlock()
    const word = screen.getByText('No recent events')
    expect(word.className).toContain('text-amber-400')
    const line = word.closest('p')!
    expect(line.className).toContain('text-neutral-500')
    // colour lives in the DOT:
    expect(line.querySelector('.bg-amber-400')).toBeTruthy()
    expect(screen.getByText(/usually a removed snippet, an ad blocker, or a CSP/)).toBeTruthy()
    expect(screen.getByText('Troubleshooting guide')).toBeTruthy()
    // …and never in a panel background (the replaced idiom):
    expect(container.querySelector('[class*="bg-amber-500/10"]')).toBeNull()
    expect(container.querySelector('[class*="bg-emerald-500/10"]')).toBeNull()
  })

  it('waiting: neutral dot + listening line with the domain', () => {
    mockInstall.mockReturnValue({ data: { install_status: 'pending' }, isLoading: false })
    renderBlock()
    const word = screen.getByText('Listening for your first event…')
    const line = word.closest('p')!
    expect(line.querySelector('.bg-neutral-600')).toBeTruthy()
    expect(screen.getByText(/load example\.com in a browser/)).toBeTruthy()
  })

  it('active: stays silent — the header row already says it', () => {
    mockInstall.mockReturnValue({
      data: { install_status: 'active', last_event_at: new Date().toISOString() },
      isLoading: false,
    })
    renderBlock()
    // compact === active on this mount, so the line self-hides; the state
    // reads on the header ("Installed and reporting · last event …s ago").
    expect(screen.queryByText('No recent events')).toBeNull()
    expect(screen.queryByText('Listening for your first event…')).toBeNull()
    expect(screen.getByText(/Installed and reporting|last event/)).toBeTruthy()
  })
})
