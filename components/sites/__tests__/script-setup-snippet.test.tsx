import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ScriptSetupBlock from '@/components/sites/ScriptSetupBlock'

// No siteId is passed, so the install-health loop never mounts; the SWR hook
// is stubbed anyway so jsdom never fetches.
vi.mock('@/lib/swr/dashboard', () => ({
  useInstallStatus: () => ({ data: undefined, isLoading: false }),
}))

// The visitor-recognition storage/TTL control was removed with the pre-launch
// triage: public/script.js never read data-storage / data-storage-ttl (session
// identification is fully server-side), so the control configured nothing.
// This pins both halves of the removal — the row is gone from the panel and
// the emitted snippet carries no storage attributes even for a site whose
// stored script_features still holds the legacy keys.
describe('ScriptSetupBlock without the visitor-recognition control', () => {
  it('emits a snippet with no storage attributes and renders no Visitor recognition row', () => {
    const { container } = render(
      <ScriptSetupBlock
        site={{
          domain: 'example.com',
          script_features: { storage: 'session', ttl: '720', scroll: true },
        }}
      />,
    )

    const text = container.textContent ?? ''
    // Non-vacuous: the snippet itself is on screen.
    expect(text).toContain('data-domain')
    expect(text).not.toContain('data-storage')
    expect(screen.queryByText('Visitor recognition')).toBeNull()
  })
})
