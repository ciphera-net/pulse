import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { InstallCheckState } from '@/lib/api/install-check'

const flag = vi.hoisted(() => ({ on: true as boolean | null, canEdit: true }))
const api = vi.hoisted(() => ({ get: vi.fn(), start: vi.fn() }))

vi.mock('@/lib/features', () => ({ useFeature: () => flag.on }))
vi.mock('@/lib/auth/permissions', () => ({ useCan: () => flag.canEdit }))
vi.mock('@/lib/api/install-check', () => ({ getInstallCheck: api.get, startInstallCheck: api.start }))
vi.mock('@/lib/swr/dashboard', () => ({
  useInstallStatus: () => ({ data: { install_status: 'active', last_event_at: new Date().toISOString() }, error: undefined, mutate: vi.fn() }),
  useIngestHealth: () => ({ data: undefined }),
}))
vi.mock('@/lib/api/sites', () => ({ setSiteFramework: vi.fn() }))
vi.mock('@/components/sites/PlatformPicker', () => ({ PlatformPicker: () => null }))
vi.mock('@/components/ui/CopyBlock', () => ({ CopyBlock: () => <div data-testid="script-code" /> }))
vi.mock('@ciphera-net/facet', () => ({
  cn: (...a: unknown[]) => a.filter(Boolean).join(' '),
  Button: ({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { TrackingScriptSection } from '../TrackingScriptSection'

function mount() {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <TrackingScriptSection siteId="s1" domain="example.com" framework="nextjs" onFrameworkSaved={() => {}} />
    </SWRConfig>,
  )
}

const csp: InstallCheckState = {
  status: 'done',
  finished_at: new Date().toISOString(),
  passed: false,
  steps: [
    { key: 'page', state: 'pass', status: 200, ms: 300 },
    { key: 'tag', state: 'pass' },
    { key: 'script', state: 'fail', cause: 'blocked_csp' },
    { key: 'visit', state: 'skipped' },
  ],
}

beforeEach(() => {
  flag.on = true
  flag.canEdit = true
  api.get.mockReset()
  api.start.mockReset()
})

describe('the install check on Tracking script', () => {
  it('offers nothing without the beta, and asks the server nothing', async () => {
    flag.on = false
    mount()
    expect(screen.queryByRole('button', { name: 'Check now' })).toBeNull()
    await act(async () => {})
    expect(api.get).not.toHaveBeenCalled()
  })

  it('offers no button to someone who cannot edit the site', async () => {
    flag.canEdit = false
    api.get.mockResolvedValue({ status: 'none' })
    mount()
    await act(async () => {})
    expect(screen.queryByRole('button', { name: 'Check now' })).toBeNull()
  })

  it('runs a check and shows its steps', async () => {
    api.get.mockResolvedValue({ status: 'none' })
    api.start.mockResolvedValue({ status: 'running', started_at: new Date().toISOString() })
    mount()
    const button = await screen.findByRole('button', { name: 'Check now' })
    fireEvent.click(button)
    expect(await screen.findByText('Opening example.com in a test browser. This takes about 20 seconds.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Checking…' })).toHaveProperty('disabled', true)
    expect(api.start).toHaveBeenCalledWith('s1')
  })

  it('shows a failed check and opens the script with its directives', async () => {
    api.get.mockResolvedValue(csp)
    mount()
    expect(await screen.findByText("Your site's Content Security Policy blocks js.ciphera.net. Add the two directives below to it.")).toBeTruthy()
    expect(screen.getByText('Not checked')).toBeTruthy()
    expect(screen.getByText('How to fix it')).toBeTruthy()
    await waitFor(() => expect(screen.getByTestId('script-code')).toBeTruthy())
    expect(document.querySelector('[data-install-check-step="script"]')?.getAttribute('data-tone')).toBe('fail')
  })
})
