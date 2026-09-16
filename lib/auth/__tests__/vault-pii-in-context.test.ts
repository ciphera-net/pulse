import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mergeVaultPii } from '@/lib/auth/context'

/**
 * The vault key reaches the whole app, not one component.
 *
 * 🔴 THE BUG THIS GUARDS. The key bridge put a vault key on every browser, and
 * exactly one React component used it — `AccountProfileTab`, into its own
 * state. So a zero-knowledge account could be named on one screen while the
 * account menu rendered "Signed in as" over two empty rows, with a perfectly
 * good key sitting in IndexedDB. Friction audit §4v.
 *
 * 🔑 Facet's `UserMenu` needed no change at all: it already reads
 * `auth.user.display_name` and `auth.user.email`. It was being handed empty
 * ones.
 */

const base = { id: 'u1', email: '', totp_enabled: false }

describe('mergeVaultPii', () => {
  it('names a session that has no address', () => {
    const out = mergeVaultPii(base, 'u1', { email: 'ada@ciphera.net', display_name: 'Ada' })
    expect(out).toMatchObject({ email: 'ada@ciphera.net', display_name: 'Ada' })
  })

  // 🔴 The read is async and an account switch can land mid-flight. Inheriting
  // the previous person's name is the exact failure a keyed store exists to
  // prevent — and the one nobody would notice until it was somebody else's.
  it('NEVER lands on a different account', () => {
    const other = { ...base, id: 'u2' }
    expect(mergeVaultPii(other, 'u1', { email: 'ada@ciphera.net' })).toBe(other)
  })

  // 🔴 A ceremony that completed while this was reading is FRESHER than the
  // envelope it opened.
  it('never overwrites an address we already have', () => {
    const named = { ...base, email: 'fresh@ciphera.net' }
    expect(mergeVaultPii(named, 'u1', { email: 'stale@ciphera.net' })).toBe(named)
  })

  it('keeps the existing display name when the vault carries none', () => {
    const withName = { ...base, display_name: 'Ada' }
    expect(mergeVaultPii(withName, 'u1', { email: 'ada@ciphera.net' })?.display_name).toBe('Ada')
  })

  it('does nothing without a session, or without an address to add', () => {
    expect(mergeVaultPii(null, 'u1', { email: 'ada@ciphera.net' })).toBeNull()
    expect(mergeVaultPii(base, 'u1', {})).toBe(base)
    expect(mergeVaultPii(base, 'u1', { email: '' })).toBe(base)
  })
})

/**
 * ⚠️ Source-text, because the WIRING is what regressed: the rule above can be
 * perfect while nothing calls it. There is no provider test — rendering
 * `AuthProvider` needs half the app mocked, and that measures the mocks.
 */
describe('the provider actually opens the vault', () => {
  const SRC = readFileSync(join(__dirname, '../context.tsx'), 'utf8')
    .split('\n')
    .map((l) => l.replace(/^\s*\/\/.*$/, '').replace(/\s\/\/.*$/, ''))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')

  it('reads the stored key and opens the vault in the context', () => {
    expect(SRC).toMatch(/loadVaultKey\s*\(/)
    expect(SRC).toMatch(/openVaultWithKey\s*\(/)
    expect(SRC).toMatch(/mergeVaultPii\s*\(/)
  })

  /**
   * ⚠️ The guard that stops a request per page load for a session that already
   * carries its address. It used to be one line — `if (!id || user?.email)
   * return` — and became two branches when each had to ANSWER the vault-state
   * question rather than just bail: nobody signed in is 'unknown', an already
   * named session is 'open'.
   */
  it('does not ask when the session can already be named', () => {
    expect(SRC).toMatch(/if\s*\(user\?\.email\)\s*\{[\s\S]{0,120}setVaultState\('open'\)[\s\S]{0,40}return/)
  })
})

/**
 * ── VaultState: one source of truth for "can we name this person" ────────────
 *
 * 🔴 EVERY SURFACE USED TO DERIVE ITS OWN ANSWER FROM `!user.email`, and each
 * got it wrong differently: the settings screen showed a locked banner for
 * 103ms, the account menu drew a label over two empty rows. `!user.email` is
 * trivially true before an async read finishes — a sentinel standing in for a
 * state that has three values, not two.
 *
 * ⚠️ 'locked' is the ONLY value a surface may assert anything about. Treating
 * 'unknown' as 'locked' IS the bug this replaces, which is why the menu passes
 * its fallback on `=== 'locked'` and never on `!== 'open'`.
 */
describe('the provider resolves VaultState on every path', () => {
  const SRC = readFileSync(join(__dirname, '../context.tsx'), 'utf8')
    .split('\n')
    .map((l) => l.replace(/^\s*\/\/.*$/, '').replace(/\s\/\/.*$/, ''))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')

  it('exposes it on the context', () => {
    expect(SRC).toMatch(/vaultState:\s*VaultState/)
    expect(SRC).toMatch(/value=\{\{\s*user,\s*vaultState,/)
  })

  // 🔴 An early return that leaves it 'unknown' is a surface waiting forever
  // for an answer that already arrived — worse than a wrong answer, because it
  // never resolves.
  it('answers "locked" for no key, for a vault that will not open, and on a throw', () => {
    const effect = SRC.slice(SRC.indexOf('const id = user?.id'), SRC.indexOf('const refresh = useCallback'))
    expect(effect).toMatch(/if\s*\(!key\)\s*\{\s*setVaultState\('locked'\)/)
    expect(effect).toMatch(/if\s*\(!pii\?\.email\)\s*\{\s*setVaultState\('locked'\)/)
    expect(effect).toMatch(/catch[\s\S]*setVaultState\('locked'\)/)
    expect(effect).toMatch(/setVaultState\('open'\)/)
  })

  it('resets to "unknown" when there is nobody signed in', () => {
    expect(SRC).toMatch(/if\s*\(!id\)\s*\{[\s\S]{0,200}setVaultState\('unknown'\)/)
  })
})

/**
 * ⚠️ The menu's fallback is gated on 'locked' EXACTLY — never on "not open",
 * which would include 'unknown' and flash the line before the name arrives.
 */
describe('the account menu only speaks when the answer is known', () => {
  const files = ['../../../components/dashboard/DashboardShell.tsx', '../../../components/dashboard/ContentHeader.tsx']
  it.each(files)('%s gates unidentifiedLabel on === locked', (f) => {
    const src = readFileSync(join(__dirname, f), 'utf8')
    expect(src).toMatch(/unidentifiedLabel=\{auth\.vaultState === 'locked' \?/)
    expect(src).not.toMatch(/unidentifiedLabel=\{auth\.vaultState !== 'open'/)
  })
})
