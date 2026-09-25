import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import type {
  PreferencesDocument,
  CategoryPreferenceDoc,
} from '@/lib/api/notifications-preferences'

// --- Mocks ---------------------------------------------------------------

const getPrefsDocument = vi.fn()
const updatePrefs = vi.fn()
vi.mock('@/lib/api/notifications-preferences', () => ({
  getPrefsDocument: () => getPrefsDocument(),
  updatePrefs: (w: unknown) => updatePrefs(w),
}))

const toastError = vi.fn()
// Toggle keeps its real switch semantics (role + aria-checked) and forwards
// the naming props Facet's Toggle forwards, the same stand-in
// AccountSecurityAlertsTab's test uses.
// The panel line names the container from the ONE team-state signal (PULSE-59).
let mockTeamState: 'alone' | 'team' | null = 'team'
vi.mock('@/lib/hooks/useTeamState', () => ({ useTeamState: () => mockTeamState }))

vi.mock('@ciphera-net/facet', () => ({
  cn: (...a: any[]) => a.flat(Infinity).filter(Boolean).join(' '),
  Toggle: ({ checked, onChange, disabled, id, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledBy }: any) => (
    <button role="switch" aria-checked={checked} disabled={disabled} onClick={onChange} id={id} aria-label={ariaLabel} aria-labelledby={ariaLabelledBy} />
  ),
  Button: ({ children, onClick, ...rest }: any) => (
    <button type="button" onClick={onClick} {...rest}>
      {children}
    </button>
  ),
  toast: { error: (...a: any[]) => toastError(...a), success: vi.fn() },
  getAuthErrorMessage: (e: Error) => e?.message ?? '',
}))

import MyPreferencesTab from '../MyPreferencesTab'

// --- Fixtures ------------------------------------------------------------

function cat(
  id: string,
  displayName: string,
  criticality: 'critical' | 'standard' | 'low',
  over: Partial<CategoryPreferenceDoc> = {},
): CategoryPreferenceDoc {
  return {
    category_id: id,
    display_name: displayName,
    criticality,
    suppressible: criticality !== 'critical',
    default_email: true,
    email: true,
    stored: false,
    ...over,
  }
}

function doc(overrides: Partial<PreferencesDocument> = {}): PreferencesDocument {
  return {
    product: 'pulse',
    categories: [
      cat('billing', 'Billing', 'critical'),
      cat('security', 'Security', 'critical'),
      cat('uptime', 'Monitoring', 'standard'),
      cat('site', 'Site activity', 'low'),
      cat('team', 'Team', 'low', { email: false, stored: true }),
      cat('system', 'System', 'low'),
      cat('lifecycle', 'Getting started', 'low'),
    ],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  getPrefsDocument.mockResolvedValue(doc())
  // The PUT answers with the stored truth re-read: the fixture applies the
  // write to a fresh document, the way Iris does.
  updatePrefs.mockImplementation(async (w: any) => {
    const next = doc()
    for (const [id, write] of Object.entries<any>(w.categories ?? {})) {
      const c = next.categories.find((x) => x.category_id === id)
      if (c) Object.assign(c, { email: write.email, stored: true })
    }
    return { ...next, ok: true }
  })
})

const switchFor = (name: string) => screen.getByRole('switch', { name: `Email for ${name}` })

// --- Tests ---------------------------------------------------------------

describe('MyPreferencesTab (one switch per category)', () => {
  it('renders the seven categories in the family order with registry names', async () => {
    render(<MyPreferencesTab />)
    await screen.findByText('Billing')
    const labels = ['Billing', 'Security', 'Monitoring', 'Site activity', 'Team', 'System', 'Getting started']
    const positions = labels.map((l) => screen.getByText(l).compareDocumentPosition(screen.getByText('Billing')))
    // Every later label FOLLOWS Billing in document order.
    positions.slice(1).forEach((p) => expect(p & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy())
  })

  it('an unsuppressible category shows the Always on chip and NO switch', async () => {
    render(<MyPreferencesTab />)
    await screen.findByText('Billing')
    expect(screen.getAllByText('Always on')).toHaveLength(2)
    expect(screen.queryByRole('switch', { name: 'Email for Billing' })).toBeNull()
    expect(screen.queryByRole('switch', { name: 'Email for Security' })).toBeNull()
  })

  it('a suppressible category shows one switch, named for its row, reflecting the effective email value', async () => {
    render(<MyPreferencesTab />)
    await screen.findByText('Billing')
    expect(screen.getAllByRole('switch')).toHaveLength(5)
    expect(switchFor('Monitoring')).toHaveAttribute('aria-checked', 'true')
    expect(switchFor('Team')).toHaveAttribute('aria-checked', 'false')
  })

  it('🔴 a flip writes ONE boolean for ONE category and nothing else', async () => {
    render(<MyPreferencesTab />)
    await screen.findByText('Billing')
    fireEvent.click(switchFor('Monitoring'))
    await waitFor(() => expect(updatePrefs).toHaveBeenCalledTimes(1))
    expect(updatePrefs.mock.calls[0][0]).toEqual({ categories: { uptime: { email: false } } })
    // The retired fields never leave this page: Iris release B rejects them.
    const body = JSON.stringify(updatePrefs.mock.calls[0][0])
    for (const gone of ['recipient_preferences', 'in_app', 'digest', 'muted', 'retention_override', 'quiet_hours', 'timezone']) {
      expect(body).not.toContain(gone)
    }
  })

  it('adopts the SERVER response after a write (stored truth, not the optimistic guess)', async () => {
    const answered = doc()
    // The server disagrees with the click: it reports the row still ON.
    updatePrefs.mockResolvedValue({ ...answered, ok: true })
    render(<MyPreferencesTab />)
    await screen.findByText('Billing')
    fireEvent.click(switchFor('Monitoring'))
    await waitFor(() => expect(updatePrefs).toHaveBeenCalled())
    await waitFor(() => expect(switchFor('Monitoring')).toHaveAttribute('aria-checked', 'true'))
  })

  it('a trigger refusal (422) surfaces the server words and changes nothing', async () => {
    updatePrefs.mockRejectedValue(new Error('category billing is always on; in-app and email cannot be disabled for it'))
    render(<MyPreferencesTab />)
    await screen.findByText('Billing')
    fireEvent.click(switchFor('Team'))
    await waitFor(() => expect(toastError).toHaveBeenCalled())
    expect(toastError.mock.calls[0][0]).toMatch(/always on/)
    expect(switchFor('Team')).toHaveAttribute('aria-checked', 'false')
  })

  it('titles the panel in sentence case and states the model once, without a dash', async () => {
    render(<MyPreferencesTab />)
    await screen.findByText('Billing')
    expect(screen.getByRole('heading', { name: 'Email' })).toBeInTheDocument()
    const desc = screen.getByText(/Every notification shows in the app the moment it happens/)
    expect(desc.textContent).toMatch(/Switch it off per category/)
    expect(desc.textContent).toMatch(/yours, not the team's/)
    expect(desc.textContent).not.toMatch(/[—–]/)
  })

  it('says only "These settings are yours." to somebody alone (PULSE-59)', async () => {
    mockTeamState = 'alone'
    render(<MyPreferencesTab />)
    await screen.findByText('Billing')
    const desc = screen.getByText(/Every notification shows in the app the moment it happens/)
    expect(desc.textContent).toMatch(/These settings are yours\.$/)
    expect(desc.textContent).not.toMatch(/team|workspace/i)
    mockTeamState = 'team'
  })

  // The row's NAME is the registry's (Iris, out of scope for PULSE-59); the
  // caption under it is this page's own copy, so it follows the alone rule.
  it('captions the team category without the word team for somebody alone (PULSE-59)', async () => {
    mockTeamState = 'alone'
    render(<MyPreferencesTab />)
    expect(await screen.findByText('People joining through an invite, and role changes.')).toBeTruthy()
    expect(screen.queryByText('People joining your team and role changes.')).toBeNull()
    mockTeamState = 'team'
  })

  it('captions the team category as the team in team state', async () => {
    render(<MyPreferencesTab />)
    expect(await screen.findByText('People joining your team and role changes.')).toBeTruthy()
  })

  it('🔴 the page carries none of the retired vocabulary in its CODE (comments stripped first)', () => {
    // A source guard that reads comments flags the sentence explaining what
    // was retired. Strip block and line comments, then scan what ships.
    const src = readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'MyPreferencesTab.tsx'),
      'utf8',
    )
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    for (const gone of [/digest/i, /quiet.?hours/i, /retention/i, /\bmute/i, /in_app\b/, /RailGrid/, /TimeField/, /Select\b/]) {
      expect(src).not.toMatch(gone)
    }
  })

  it('renders the locked rows from `suppressible`, never from the display word', async () => {
    // A standard, unsuppressible category (the trigger's own column) locks;
    // a "critical" word on a suppressible one does not.
    getPrefsDocument.mockResolvedValue(
      doc({
        categories: [
          cat('uptime', 'Monitoring', 'standard', { suppressible: false }),
          cat('site', 'Site activity', 'critical', { suppressible: true }),
        ],
      }),
    )
    render(<MyPreferencesTab />)
    await screen.findByText('Monitoring')
    expect(screen.getAllByText('Always on')).toHaveLength(1)
    expect(screen.queryByRole('switch', { name: 'Email for Monitoring' })).toBeNull()
    expect(switchFor('Site activity')).toBeInTheDocument()
  })

  /**
   * R-A (owner, 22-09-2026, PULSE-15): the user-facing purge is retired — the
   * Danger zone that held it, its true-count fetch and its typed-DELETE dialog
   * all left this tab. Cleanup is Iris's automatic sweeper.
   *
   * MUST FAIL ON: MyPreferencesTab.tsx — render any button whose name starts
   * with "Purge", or any "Danger zone" heading.
   */
  it('carries no Danger zone and no purge — cleanup is automatic', async () => {
    render(<MyPreferencesTab />)
    await screen.findByText('Billing')
    expect(screen.queryByText(/Danger zone/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /^Purge/ })).toBeNull()
    expect(screen.queryByText(/Notification history/)).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renders an empty row when the registry returns no categories', async () => {
    getPrefsDocument.mockResolvedValue(doc({ categories: [] }))
    render(<MyPreferencesTab />)
    expect(await screen.findByText('No notification categories')).toBeInTheDocument()
  })

  it('renders the loading skeleton, not a blank page, before the document resolves', () => {
    getPrefsDocument.mockReturnValue(new Promise(() => {}))
    render(<MyPreferencesTab />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('a failed load shows the error state with a retry that re-reads', async () => {
    getPrefsDocument.mockRejectedValueOnce(new Error('boom'))
    render(<MyPreferencesTab />)
    const retry = await screen.findByRole('button', { name: /try again|retry/i })
    getPrefsDocument.mockResolvedValue(doc())
    fireEvent.click(retry)
    expect(await screen.findByText('Billing')).toBeInTheDocument()
  })
})
