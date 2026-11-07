import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

/**
 * Settings → General, the script's switches. The version lock (Subresource Integrity) was removed on 07-11-2026:
 * "What the script counts" offers no switch for it, and a save never writes `sri`. A site that saved the switch
 * before then keeps its stored key, because the page MERGES its keys over the stored object, and nothing reads it.
 */

const useSiteMock = vi.fn()
vi.mock('@/lib/swr/dashboard', () => ({
  useSite: () => useSiteMock(),
  useQuarantineStats: () => ({ data: { total_quarantined: 0, last_7d: 0, last_24h: 0 }, error: undefined, mutate: vi.fn() }),
}))
vi.mock('@/lib/auth/permissions', () => ({ useCan: () => true }))
vi.mock('@/lib/hold/pending', () => ({ usePendingKeys: () => new Set<string>() }))

const updateSite = vi.fn()
vi.mock('@/lib/api/sites', () => ({ updateSite: (...a: unknown[]) => updateSite(...a) }))

// The save bar portals into a slot the settings shell owns and renders nothing without one.
vi.mock('@/components/settings/shell-slots', () => ({ useSaveSlot: () => document.body, useHeaderSlot: () => null }))

// The script section and the two dialogs have their own hooks and tests; this file is about the switches and the save.
vi.mock('../TrackingScriptSection', () => ({ TrackingScriptSection: () => null }))
vi.mock('@/components/sites/DeleteSiteModal', () => ({ default: () => null }))
vi.mock('@/components/settings/unified/ResetDataModal', () => ({ default: () => null }))

interface ButtonProps {
  children?: ReactNode
  onClick?: () => void
  disabled?: boolean
}
interface ToggleProps {
  checked: boolean
  onChange: () => void
  disabled?: boolean
  'aria-label'?: string
}
interface InputProps {
  id?: string
  value?: string
  onChange?: (e: { target: { value: string } }) => void
}

// Facet stand-ins: real DOM, so the switches and the save bar can be found by role and name.
vi.mock('@ciphera-net/facet', () => ({
  cn: (...a: unknown[]) => a.filter(Boolean).join(' '),
  Button: ({ children, onClick, disabled }: ButtonProps) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  Input: ({ id, value, onChange }: InputProps) => <input id={id} value={value} onChange={(e) => onChange?.(e)} />,
  Select: () => <div />,
  Toggle: ({ checked, onChange, disabled, 'aria-label': ariaLabel }: ToggleProps) => (
    <button type="button" role="switch" aria-checked={checked} aria-label={ariaLabel} disabled={disabled} onClick={() => onChange()} />
  ),
  toast: { success: vi.fn(), error: vi.fn() },
}))

import GeneralPage from '../GeneralPage'

function mount(scriptFeatures: Record<string, unknown>) {
  useSiteMock.mockReturnValue({
    data: {
      id: 's1',
      name: 'Demo',
      domain: 'example.com',
      timezone: 'Europe/Brussels',
      script_features: scriptFeatures,
      respect_dnt: true,
      respect_gpc: true,
      show_referrer_domains: false,
    },
    error: undefined,
    isValidating: false,
    mutate: vi.fn(),
  })
  return render(<GeneralPage siteId="s1" />)
}

async function saveAfterTurningOffScrollDepth() {
  fireEvent.click(screen.getByRole('switch', { name: 'Scroll depth' }))
  fireEvent.click(await screen.findByRole('button', { name: /save changes/i }))
  await waitFor(() => expect(updateSite).toHaveBeenCalledTimes(1))
  return updateSite.mock.calls[0][1] as { script_features: Record<string, unknown> }
}

beforeEach(() => {
  updateSite.mockReset()
  updateSite.mockResolvedValue(undefined)
})

describe('Settings → General without the version lock', () => {
  it('offers no switch to lock the script to a version', () => {
    mount({ sri: true })
    // Non-vacuous: the section's other switches are on screen.
    expect(screen.getByRole('switch', { name: 'Scroll depth' })).toBeTruthy()
    expect(screen.getByRole('switch', { name: 'Respect Do Not Track' })).toBeTruthy()
    expect(screen.queryByText(/Lock the script/i)).toBeNull()
    expect(screen.queryByText(/Subresource Integrity/i)).toBeNull()
  })

  it('keeps a stored sri key as it was when it saves, and writes none of its own', async () => {
    mount({ sri: true, storage: 'session', scroll: true })
    const sent = await saveAfterTurningOffScrollDepth()
    expect(sent.script_features).toEqual({
      sri: true,
      storage: 'session',
      scroll: false,
      outbound: true,
      downloads: true,
      interactions: false,
      clicks: true,
      copy: true,
      forms: true,
    })
  })

  it('adds no sri key to a site that never had one', async () => {
    mount({})
    const sent = await saveAfterTurningOffScrollDepth()
    expect(Object.keys(sent.script_features)).not.toContain('sri')
    expect(sent.script_features.scroll).toBe(false)
  })
})
