import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// --- Mocks ---------------------------------------------------------------

let mockCanEdit = true
vi.mock('@/lib/auth/permissions', () => ({
  useCan: () => mockCanEdit,
}))

const useSite = vi.fn()
vi.mock('@/lib/swr/dashboard', () => ({
  useSite: (...a: unknown[]) => useSite(...a),
}))

const updateSite = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/api/sites', () => ({
  updateSite: (...a: unknown[]) => updateSite(...a),
}))

vi.mock('@/lib/env', () => ({
  env: { NEXT_PUBLIC_APP_URL: 'https://pulse.ciphera.net' },
}))

// SaveBar is portal + shell-slot machinery — stub it to a marker so the smoke
// render doesn't depend on the shell being mounted. Its own behavior is covered
// elsewhere; here we only assert the tab wires dirty state + the edit gate.
vi.mock('@/components/settings/SettingsSaveBar', () => ({
  default: ({ isDirty }: { isDirty: boolean }) => (
    <div data-testid="savebar" data-dirty={String(isDirty)} />
  ),
}))

vi.mock('@ciphera-net/facet', () => ({
  // `@/lib/utils` re-exports cn from facet; the real panels + StatusChip call it.
  cn: (...args: any[]) => args.flat().filter(Boolean).join(' '),
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Input: (props: any) => <input {...props} />,
  InputGroup: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  InputGroupInput: (props: any) => <input {...props} />,
  InputGroupButton: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Toggle: ({ checked, onChange, disabled, ...props }: any) => (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      {...props}
    />
  ),
  toast: { success: vi.fn(), error: vi.fn() },
  getAuthErrorMessage: () => 'error',
}))

import SiteVisibilityTab from '../SiteVisibilityTab'
import { toast } from '@ciphera-net/facet'

const mutate = vi.fn().mockResolvedValue(undefined)

function siteState(over: Record<string, unknown> = {}) {
  return {
    data: { name: 'Acme', is_public: false, has_password: false, ...over },
    error: undefined,
    mutate,
  }
}

beforeEach(() => {
  mockCanEdit = true
  useSite.mockReset().mockReturnValue(siteState())
  updateSite.mockClear()
  mutate.mockClear()
  ;(toast.success as any).mockClear?.()
  ;(toast.error as any).mockClear?.()
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
})

describe('SiteVisibilityTab (Facet structured panels)', () => {
  it('renders ONE Visibility panel; share-link + password rows stay hidden until public is on', () => {
    render(<SiteVisibilityTab siteId="s1" />)
    expect(screen.getByText('Visibility')).toBeInTheDocument()
    expect(screen.getByText('Public dashboard')).toBeInTheDocument()
    // Collapsed by default (site not public).
    expect(screen.queryByText('Public link')).toBeNull()
    expect(screen.queryByText('Password protection')).toBeNull()
  })

  it('reveals the share-link + password rows and flags the unsaved state when public is toggled on', () => {
    render(<SiteVisibilityTab siteId="s1" />)
    fireEvent.click(screen.getByRole('switch', { name: 'Public dashboard' }))
    expect(screen.getByText('Public link')).toBeInTheDocument()
    expect(screen.getByText('Password protection')).toBeInTheDocument()
    // Server state still not public → chip reflects the SAVED state honestly.
    expect(screen.getByText('Not saved yet')).toBeInTheDocument()
    // Dirty state propagates to the save bar.
    expect(screen.getByTestId('savebar').dataset.dirty).toBe('true')
  })

  it('awaits the clipboard write before toasting (B7)', async () => {
    render(<SiteVisibilityTab siteId="s1" />)
    fireEvent.click(screen.getByRole('switch', { name: 'Public dashboard' }))
    fireEvent.click(screen.getByRole('button', { name: /Copy public link/i }))
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://pulse.ciphera.net/share/s1'),
    )
    expect(toast.success).toHaveBeenCalledWith('Link copied')
  })

  it('hides the save bar and disables the toggle when the user cannot edit', () => {
    mockCanEdit = false
    render(<SiteVisibilityTab siteId="s1" />)
    expect(screen.queryByTestId('savebar')).toBeNull()
    expect(screen.getByRole('switch', { name: 'Public dashboard' })).toBeDisabled()
  })

  it('surfaces a distinct error state (not an infinite spinner) when the site fetch fails', () => {
    useSite.mockReturnValue({ data: undefined, error: new Error('boom'), mutate })
    render(<SiteVisibilityTab siteId="s1" />)
    expect(screen.getByText(/Couldn't load this/i)).toBeInTheDocument()
  })
})
