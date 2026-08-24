import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ScriptSetupBlock from '@/components/sites/ScriptSetupBlock'

// An active install with a siteId renders the customize panel EXPANDED, which
// is what makes the absence assertion below meaningful — on a collapsed panel
// every row is absent and the test would pass against any code.
vi.mock('@/lib/swr/dashboard', () => ({
  useInstallStatus: () => ({ data: { install_status: 'active' }, isLoading: false }),
}))

// The visitor-recognition storage/TTL control was removed with the pre-launch
// triage: public/script.js never read data-storage / data-storage-ttl (session
// identification is fully server-side), so the control configured nothing.
// The snippet half is pinned against the emitted tag; the panel half is pinned
// against the EXPANDED panel, anchored on a row that must be present.
describe('ScriptSetupBlock without the visitor-recognition control', () => {
  it('emits a snippet with no storage attributes and renders no Visitor recognition row', () => {
    const { container } = render(
      <ScriptSetupBlock
        site={{
          domain: 'example.com',
          script_features: { storage: 'session', ttl: '720', scroll: true },
        }}
        siteId="s1"
      />,
    )

    // In this state the tag sits behind the "Show snippet" disclosure.
    fireEvent.click(screen.getByText('Show snippet'))
    const text = container.textContent ?? ''
    // Non-vacuous for the snippet half: the tag itself is on screen.
    expect(text).toContain('data-domain')
    expect(text).not.toContain('data-storage')
    // Non-vacuous for the panel half: a surviving sibling row IS rendered,
    // so the removed row's absence is about the row, not a collapsed panel.
    expect(screen.getByText(/Subresource Integrity/i)).toBeTruthy()
    expect(screen.queryByText('Visitor recognition')).toBeNull()
  })
})
