import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

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

// SaveBar is portal + shell-slot machinery. Stub it to a marker so the smoke
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
  // Matches the shipped Toggle's own prop signature exactly (checked/onChange/
  // className/disabled only) rather than spreading every prop through: the
  // real component forwards no id and no aria-label, and a mock that did would
  // let a test pass on a name the production DOM never carries.
  Toggle: ({ checked, onChange, disabled, className }: any) => (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={className}
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

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

const SOURCE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'SiteVisibilityTab.tsx',
)

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
    fireEvent.click(screen.getByRole('switch'))
    expect(screen.getByText('Public link')).toBeInTheDocument()
    expect(screen.getByText('Password protection')).toBeInTheDocument()
    // Server state still not public → chip reflects the SAVED state honestly.
    const chip = screen.getByText('Not saved yet')
    expect(chip).toBeInTheDocument()
    // Every other warning-tone StatusChip in this codebase carries a dot; this
    // one is the "Live" chip's sibling in the same slot, so it must match.
    expect(chip.querySelector('.rounded-full')).not.toBeNull()
    // Dirty state propagates to the save bar.
    expect(screen.getByTestId('savebar').dataset.dirty).toBe('true')
  })

  it('awaits the clipboard write before toasting (B7)', async () => {
    render(<SiteVisibilityTab siteId="s1" />)
    fireEvent.click(screen.getByRole('switch'))
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
    expect(screen.getByRole('switch')).toBeDisabled()
  })

  it('surfaces a distinct error state (not an infinite spinner) when the site fetch fails', () => {
    useSite.mockReturnValue({ data: undefined, error: new Error('boom'), mutate })
    render(<SiteVisibilityTab siteId="s1" />)
    // Names the specific thing that failed (rule 10), not the generic default.
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent("Couldn't load this site")
  })

  it('renders a skeleton (role=status), never a bare spinner, while the site is still loading', () => {
    useSite.mockReturnValue({ data: undefined, error: undefined, mutate })
    render(<SiteVisibilityTab siteId="s1" />)
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('gives the live-link and password-set chips a dot, matching every other success-tone chip in the tab', () => {
    useSite.mockReturnValue(siteState({ is_public: true, has_password: true }))
    render(<SiteVisibilityTab siteId="s1" />)
    const live = screen.getByText('Live')
    expect(live.querySelector('.rounded-full')).not.toBeNull()
    const passwordSet = screen.getByText('Password set')
    expect(passwordSet.querySelector('.rounded-full')).not.toBeNull()
  })

  it('titles the panel as a sentence-case level-2 heading, not an uppercase kicker', () => {
    render(<SiteVisibilityTab siteId="s1" />)
    const h2 = screen.getByRole('heading', { level: 2, name: 'Visibility' })
    expect(h2.className).toMatch(/\btext-sm\b/)
    expect(h2.className).toMatch(/\bfont-semibold\b/)
    expect(h2.className).not.toMatch(/uppercase|micro-label/)
  })

  it('renders the copy-link control as a real button carrying its own accessible name', () => {
    render(<SiteVisibilityTab siteId="s1" />)
    fireEvent.click(screen.getByRole('switch'))
    const copyButton = screen.getByRole('button', { name: /Copy public link/i })
    expect(copyButton.tagName).toBe('BUTTON')
    expect(copyButton).toHaveAttribute('aria-label', 'Copy public link')
  })

  it('never uses an em dash, en dash or a literal ellipsis in its user-facing copy', () => {
    // Scoped to string literals, not the whole stripped source, so a decision
    // comment is free to use the punctuation its own quoted strings may not.
    const stripped = stripComments(readFileSync(SOURCE_PATH, 'utf8'))
    const stringLiterals = stripped.match(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g) ?? []
    const offenders = stringLiterals.filter(s => /[—–]/.test(s) || /\.\.\./.test(s))
    expect(offenders).toEqual([])
  })

  it('never passes aria-label to Toggle: the shipped Facet Toggle drops any prop besides checked/onChange/className/disabled, so it would be a no-op that reads like an accessible name and is not one', () => {
    const stripped = stripComments(readFileSync(SOURCE_PATH, 'utf8'))
    const toggleBlocks = stripped.match(/<Toggle\b[\s\S]*?\/>/g) ?? []
    // Both toggles (public dashboard, password protection) must be present.
    expect(toggleBlocks.length).toBe(2)
    for (const block of toggleBlocks) {
      expect(block).not.toMatch(/aria-label/)
    }
  })

  it('keeps the danger signal on "Remove password protection" in the word only, never a tinted background wash', () => {
    useSite.mockReturnValue(siteState({ is_public: true, has_password: true }))
    render(<SiteVisibilityTab siteId="s1" />)
    const removeButton = screen.getByRole('button', { name: 'Remove password protection' })
    expect(removeButton.className).toMatch(/\btext-destructive\b/)
    expect(removeButton.className).not.toMatch(/bg-destructive/)
  })
})
