import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import * as orgApi from '@/lib/api/organization'

// --- Mocks ---------------------------------------------------------------

const refreshSession = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/auth/context', () => ({
  useAuth: () => ({ user: { id: 'u_owner', org_id: 'org_1' }, refreshSession }),
}))

let mockIsOwner = true
let mockIsAdminOrOwner = true
vi.mock('@/lib/auth/permissions', () => ({
  useIsOwner: () => mockIsOwner,
  useIsAdminOrOwner: () => mockIsAdminOrOwner,
}))

vi.mock('@/lib/api/organization', () => ({
  getOrganization: vi.fn().mockResolvedValue({ name: 'Acme Corp', slug: 'acme-corp' }),
  getOrganizationMembers: vi.fn().mockResolvedValue([]),
  updateOrganization: vi.fn().mockResolvedValue(undefined),
  deleteOrganization: vi.fn().mockResolvedValue(undefined),
  transferOwnership: vi.fn().mockResolvedValue(undefined),
}))

// Minimal Facet surface used by the tab + the shared components it renders
// (DangerZone/SaveBar). SettingsLoadingState and SettingsErrorState are the
// tab's own house devices and are exercised for real below, not stubbed, so
// the tests pin their actual DOM shape (role="status" / role="alert") rather
// than a mock's approximation of it.
vi.mock('@ciphera-net/facet', () => ({
  // `@/lib/utils` re-exports cn from facet; the real panels call it.
  cn: (...args: any[]) => args.flat().filter(Boolean).join(' '),
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Input: (props: any) => <input {...props} />,
  InputGroup: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  InputGroupAddon: ({ children, align, ...props }: any) => <div {...props}>{children}</div>,
  InputGroupInput: (props: any) => <input {...props} />,
  Select: ({ value, onChange, options, placeholder, ...props }: any) => (
    <select {...props} value={value} onChange={e => onChange?.(e.target.value)}>
      <option value="">{placeholder}</option>
      {options?.map((o: any) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  ),
  toast: { success: vi.fn(), error: vi.fn() },
  getAuthErrorMessage: () => 'error',
}))

// M6: stub framer-motion with the shared mock (framer-mock.tsx), which
// pins motion.<tag> to a single cached component per tag rather than a fresh
// one per property access: the DangerZone reveals toggle each other off in
// the SAME click handler (Transfer's onClick also clears showDeleteConfirm
// and vice versa) and the typed-DELETE field re-renders the tab on every
// keystroke, so a trap that returns a fresh function per access would change
// the component's identity on every render, forcing React to unmount and
// remount the whole reveal (and the confirm button a test is polling)
// instead of just updating it in place. It also drops initial/animate/exit/
// transition before they reach the DOM, so the height+fade device is pinned
// against source instead (see the two tests below).
vi.mock('framer-motion', () => import('@/components/settings/__tests__/framer-mock'))

// The page is worded from the ONE team-state signal (PULSE-59).
let mockTeamState: 'alone' | 'team' | null = 'team'
vi.mock('@/lib/hooks/useTeamState', () => ({ useTeamState: () => mockTeamState }))

import WorkspaceGeneralTab from '../WorkspaceGeneralTab'

// Strips `//` and `/* */` comments so the source-text check below pins the
// actual user-facing copy, not the WHY-comments beside it. The component has
// no `//` inside a string literal (no URLs), so a plain regex is safe.
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

const SOURCE_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'WorkspaceGeneralTab.tsx')
const SOURCE = readFileSync(SOURCE_PATH, 'utf8')

beforeEach(() => {
  mockTeamState = 'team'
  mockIsOwner = true
  mockIsAdminOrOwner = true
  refreshSession.mockClear()
  vi.clearAllMocks()
  ;(orgApi.getOrganization as any).mockResolvedValue({ name: 'Acme Corp', slug: 'acme-corp' })
  ;(orgApi.getOrganizationMembers as any).mockResolvedValue([])
})

describe('WorkspaceGeneralTab (Facet structured panels)', () => {
  it('loads the team panel with name + slug once the org resolves', async () => {
    render(<WorkspaceGeneralTab />)
    await waitFor(() => expect(screen.getByDisplayValue('Acme Corp')).toBeTruthy())
    // Panel title + slug addon are present.
    expect(screen.getByText('Team')).toBeTruthy()
    expect(screen.getByText('pulse.ciphera.net/')).toBeTruthy()
    expect(screen.getByDisplayValue('acme-corp')).toBeTruthy()
  })

  it('renders the panel title as a sentence-case level-2 heading, the SectionHeader idiom', async () => {
    render(<WorkspaceGeneralTab />)
    await waitFor(() => expect(screen.getByDisplayValue('Acme Corp')).toBeTruthy())
    expect(screen.getByRole('heading', { level: 2, name: 'Team' })).toBeTruthy()
  })

  it('renders the danger zone with distinct Transfer + Delete entry actions', async () => {
    render(<WorkspaceGeneralTab />)
    await waitFor(() => expect(screen.getByDisplayValue('Acme Corp')).toBeTruthy())
    expect(screen.getByText('Danger zone')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Transfer' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy()
  })

  it('keeps the typed-DELETE gate: confirm stays disabled until DELETE is typed', async () => {
    render(<WorkspaceGeneralTab />)
    await waitFor(() => expect(screen.getByDisplayValue('Acme Corp')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    const confirm = await screen.findByRole('button', { name: 'Delete team' })
    expect((confirm as HTMLButtonElement).disabled).toBe(true)

    const field = screen.getByPlaceholderText('DELETE')
    fireEvent.change(field, { target: { value: 'DELETE' } })
    await waitFor(() => expect((confirm as HTMLButtonElement).disabled).toBe(false))
  })

  it('renders reveal confirm buttons in sentence case and their dismiss buttons as ghost, never a grey secondary fill', async () => {
    ;(orgApi.getOrganizationMembers as any).mockResolvedValueOnce([
      { user_id: 'u_next', user_email: 'next@acme.com', role: 'member' } as never,
    ])
    render(<WorkspaceGeneralTab />)
    await waitFor(() => expect(screen.getByDisplayValue('Acme Corp')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Transfer' }))
    expect(screen.getByRole('button', { name: 'Transfer ownership' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cancel' }).getAttribute('variant')).toBe('ghost')

    // Opening Delete closes Transfer (mutually exclusive reveals).
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByRole('button', { name: 'Delete team' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cancel' }).getAttribute('variant')).toBe('ghost')
  })

  // The shared framer-motion mock (framer-mock.tsx) deliberately drops
  // initial/animate/exit/transition before they reach the DOM, so the two
  // tests below can no longer read the house height+fade values off the
  // rendered node the way the file's old per-file mock exposed them via
  // data-motion-* attributes. `motionBlock` pins them against the reveal's
  // own source instead, scoped to its `key=` so the check still fails the
  // moment either reveal's literal values drift from the house device.
  function motionBlock(key: string): string {
    const start = SOURCE.indexOf(`key="${key}"`)
    expect(start).toBeGreaterThan(-1)
    const end = SOURCE.indexOf('</motion.div>', start)
    return SOURCE.slice(start, end)
  }

  it('opens the Transfer reveal as a height+fade motion.div on the house easing, not a bare unanimated block', async () => {
    render(<WorkspaceGeneralTab />)
    await waitFor(() => expect(screen.getByDisplayValue('Acme Corp')).toBeTruthy())

    expect(screen.queryByTestId('transfer-reveal')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Transfer' }))

    // Fails against the old markup: the pre-M6 reveal was a bare `<div>` with
    // no test id at all, and it had no exit state to fade the transfer
    // picker back out on dismiss.
    const reveal = await screen.findByTestId('transfer-reveal')
    const block = motionBlock('transfer-reveal')
    expect(block).toContain('initial={reducedMotion ? false : { height: 0, opacity: 0 }}')
    expect(block).toContain("animate={reducedMotion ? undefined : { height: 'auto', opacity: 1 }}")
    expect(block).toContain('exit={reducedMotion ? undefined : { height: 0, opacity: 0 }}')
    expect(block).toContain('transition={{ duration: DURATION_BASE, ease: EASE_APPLE }}')
    expect(reveal.className).toContain('overflow-hidden')
  })

  it('opens the Delete reveal as a height+fade motion.div on the house easing, matching the Transfer reveal device', async () => {
    render(<WorkspaceGeneralTab />)
    await waitFor(() => expect(screen.getByDisplayValue('Acme Corp')).toBeTruthy())

    expect(screen.queryByTestId('delete-reveal')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    const reveal = await screen.findByTestId('delete-reveal')
    const block = motionBlock('delete-reveal')
    expect(block).toContain('initial={reducedMotion ? false : { height: 0, opacity: 0 }}')
    expect(block).toContain("animate={reducedMotion ? undefined : { height: 'auto', opacity: 1 }}")
    expect(block).toContain('exit={reducedMotion ? undefined : { height: 0, opacity: 0 }}')
    expect(block).toContain('transition={{ duration: DURATION_BASE, ease: EASE_APPLE }}')
    expect(reveal.className).toContain('overflow-hidden')
  })

  it('shows the house loading skeleton while the organization loads, never a bare centred spinner', async () => {
    let resolveOrg: (v: unknown) => void = () => {}
    ;(orgApi.getOrganization as any).mockReturnValueOnce(new Promise((resolve) => { resolveOrg = resolve }))

    render(<WorkspaceGeneralTab />)
    const status = screen.getByRole('status')
    expect(status.getAttribute('aria-busy')).toBe('true')
    expect(screen.queryByDisplayValue('Acme Corp')).toBeNull()

    resolveOrg({ name: 'Acme Corp', slug: 'acme-corp' })
    await waitFor(() => expect(screen.getByDisplayValue('Acme Corp')).toBeTruthy())
  })

  it('shows a named error state when the organization fails to load, never a stale or empty panel', async () => {
    ;(orgApi.getOrganization as any).mockRejectedValueOnce(new Error('boom'))

    render(<WorkspaceGeneralTab />)
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain("Couldn't load your team")
    expect(screen.queryByText('Workspace')).toBeNull()
  })

  it('shows an empty row when there are no other members to transfer to, not a bare paragraph', async () => {
    render(<WorkspaceGeneralTab />)
    await waitFor(() => expect(screen.getByDisplayValue('Acme Corp')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Transfer' }))
    expect(await screen.findByText('No other members')).toBeTruthy()
    expect(screen.getByText('Invite and verify a member first.')).toBeTruthy()
  })

  it('shows a named error banner when members fail to load, never the empty-members copy', async () => {
    ;(orgApi.getOrganizationMembers as any).mockRejectedValueOnce(new Error('boom'))

    render(<WorkspaceGeneralTab />)
    await waitFor(() => expect(screen.getByDisplayValue('Acme Corp')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Transfer' }))
    const banner = await screen.findByRole('alert')
    expect(banner.textContent).toContain("Couldn't load the members")
    expect(screen.queryByText('No other members')).toBeNull()
  })

  it('hides the danger zone + save bar for plain members', async () => {
    mockIsOwner = false
    mockIsAdminOrOwner = false
    render(<WorkspaceGeneralTab />)
    await waitFor(() => expect(screen.getByDisplayValue('Acme Corp')).toBeTruthy())
    expect(screen.queryByText('Danger zone')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Transfer' })).toBeNull()
  })

  it('admins can rename but never see the danger zone: two server rules, two gates', async () => {
    mockIsOwner = false
    mockIsAdminOrOwner = true
    render(<WorkspaceGeneralTab />)
    await waitFor(() => expect(screen.getByDisplayValue('Acme Corp')).toBeTruthy())
    // Rename surfaces follow ciphera-id's owner-OR-admin rule.
    expect((screen.getByDisplayValue('Acme Corp') as HTMLInputElement).disabled).toBe(false)
    // Deletion/transfer stay owner-only.
    expect(screen.queryByRole('button', { name: 'Transfer' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
  })

  it('transfer rotates the token before the reload, because the old cookie still says owner', async () => {
    const { getOrganizationMembers } = await import('@/lib/api/organization')
    vi.mocked(getOrganizationMembers).mockResolvedValueOnce([
      { user_id: 'u_next', user_email: 'next@acme.com', role: 'member' } as never,
    ])
    // jsdom cannot navigate; capture href assignments instead.
    const hrefSpy = vi.fn()
    const originalLocation = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, set href(v: string) { hrefSpy(v) } },
    })
    try {
      render(<WorkspaceGeneralTab />)
      await waitFor(() => expect(screen.getByDisplayValue('Acme Corp')).toBeTruthy())
      fireEvent.click(screen.getByRole('button', { name: 'Transfer' }))
      fireEvent.change(screen.getByLabelText('New owner'), { target: { value: 'u_next' } })
      fireEvent.click(screen.getByRole('button', { name: 'Transfer ownership' }))
      await waitFor(() => expect(hrefSpy).toHaveBeenCalledWith('/settings/organization/general'))
      expect(refreshSession).toHaveBeenCalledTimes(1)
      // Rotation strictly BEFORE navigation: a bare reload re-hydrates the old
      // role and the ex-owner's Danger Zone survives it.
      expect(refreshSession.mock.invocationCallOrder[0]).toBeLessThan(hrefSpy.mock.invocationCallOrder[0])
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
    }
  })

  it('never uses an em dash, en dash or a literal ellipsis in its source, comments included', () => {
    const stripped = stripComments(SOURCE)
    expect(stripped).not.toMatch(/[—–]/)
    expect(stripped).not.toMatch(/\.\.\./)
  })
})

// ─── PULSE-59: unlisted for somebody alone, but the route still renders ───
describe('WorkspaceGeneralTab, alone', () => {
  it('renders without calling the container a team, workspace or organization', async () => {
    mockTeamState = 'alone'
    const { container } = render(<WorkspaceGeneralTab />)
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'Details' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(await screen.findByRole('button', { name: 'Delete all data' })).toBeTruthy()
    expect(container.textContent).not.toMatch(/team|workspace|organi[sz]ation/i)
  })
})
