import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/auth/tessera/errors', () => ({
  isInvalidCredentials: (e: unknown) => (e as { name?: string } | null)?.name === 'InvalidCredentialsError',
}))
// The real error builds its words from the authenticator's profile (lib/auth/passkey/authenticators.ts).
vi.mock('@/lib/auth/tessera/passkey-enrol', () => ({
  PasskeyPrfUnsupportedError: class PasskeyPrfUnsupportedError extends Error {
    constructor(profile: { note?: string } | null) {
      super(`${profile?.note ?? ''} Nothing was saved.`)
    }
  },
}))

import { ApiError } from '@/lib/api/client'
import { PasskeyPrfUnsupportedError } from '@/lib/auth/tessera/passkey-enrol'
import {
  changePasswordErrorMessage,
  deletionRefusedMessage,
  emailChangeErrorMessage,
  passkeyEnrolErrorMessage,
  reauthErrorMessage,
  recoveryEnrolErrorMessage,
  saveNameErrorMessage,
  unlockErrorMessage,
} from '../errors'
import { aloneGoesLine, teamGoesLine } from '../DeleteAccountSection'
import { describeApps } from '../DevicesSection'
import { agoLabel, dayGroupLabel, expiryPhrase } from '../format'

const wrongPassword = Object.assign(new Error('tessera: invalid credentials'), { name: 'InvalidCredentialsError' })

describe('the Account page\'s error words (copy deck §12.9)', () => {
  it('never shows Facet\'s status text', () => {
    expect(unlockErrorMessage(new ApiError('Invalid credentials', 401))).toBe("That password didn't match. Try again.")
    expect(unlockErrorMessage(new ApiError('x', 429))).toBe('Too many tries in a short time. Wait about a minute and try again.')
    expect(unlockErrorMessage(new ApiError('x', 503))).toBe("Couldn't reach Ciphera ID. Nothing changed. Try again.")
    expect(unlockErrorMessage(new ApiError('x', 418))).toBe("Couldn't unlock (error 418). Try again.")
    expect(unlockErrorMessage(new TypeError('Failed to fetch'))).toBe("Couldn't connect. Check your connection and try again.")
  })

  it('names each email-change failure and that nothing changed', () => {
    expect(emailChangeErrorMessage(new ApiError('x', 502))).toBe("Couldn't send the link to that address. Nothing changed. Check the address and try again.")
    expect(emailChangeErrorMessage(new ApiError('x', 503))).toBe("Email changes aren't working right now. Nothing changed. Try again later.")
    expect(emailChangeErrorMessage(new ApiError('x', 400))).toBe('That address was refused. Nothing changed. Check it and try again.')
    expect(emailChangeErrorMessage(wrongPassword)).toBe("That password didn't match. Nothing changed.")
  })

  it('the password step, the password change and the name', () => {
    expect(reauthErrorMessage(wrongPassword)).toBe("That password didn't match. Try again.")
    expect(reauthErrorMessage(new ApiError('x', 400))).toBe("Couldn't confirm your password. Try again.")
    expect(changePasswordErrorMessage(wrongPassword)).toBe("Your current password didn't match. Nothing changed.")
    expect(changePasswordErrorMessage(new ApiError('Session expired', 401))).toBe("Couldn't change your password. Try again.")
    expect(saveNameErrorMessage(new Error('Unlock your profile first — saving a name re-seals your encrypted vault.'))).toBe('Unlock your profile to change your name.')
    expect(saveNameErrorMessage(new Error('This account has no encrypted vault, so its name cannot be saved here.'))).toBe("This account has no encrypted profile, so its name can't be saved here.")
  })

  it('the dialogs', () => {
    expect(passkeyEnrolErrorMessage(wrongPassword)).toBe("That email or password didn't match. Nothing was saved.")
    expect(passkeyEnrolErrorMessage(new ApiError('x', 409))).toBe('You already have a passkey. Remove it to add another.')
    expect(passkeyEnrolErrorMessage(Object.assign(new Error('x'), { name: 'NotAllowedError' }))).toBe("The passkey prompt was closed. Nothing was saved. Try again when you're ready.")
    expect(passkeyEnrolErrorMessage(new PasskeyPrfUnsupportedError({ name: 'Bitwarden', prf: 'no', note: 'Bitwarden cannot do this yet — it has no PRF support for the passkeys it stores.' })))
      .toBe("Bitwarden can't do this yet: its passkeys can't unlock an encrypted profile. Nothing was saved.")
    expect(recoveryEnrolErrorMessage(new Error('Recovery setup did not produce a phrase. Nothing was saved.'))).toBe("Couldn't make a phrase. Nothing was saved. Try again.")
    expect(recoveryEnrolErrorMessage(new ApiError('x', 0))).toBe("Couldn't reach Ciphera ID. Nothing was saved. Check your connection and try again.")
  })

  it('a refused deletion', () => {
    expect(deletionRefusedMessage([{ name: 'Acme', action_required: 'transfer_ownership' }]))
      .toBe('You own Acme, which has another admin. Make them the owner on the Team page, then try again.')
    expect(deletionRefusedMessage([{ name: 'New', action_required: 'delete_workspace' }]))
      .toBe('Something changed since this page loaded. Check what goes with your account, then try again.')
  })
})

describe('what goes with the account', () => {
  const base = { id: 'o', name: 'Acme', slug: 'acme', member_count: 2, other_admins: 0, action_required: 'delete_workspace' as const, promotable_admins: [] }
  it('a team, by its plan\'s name, never the raw id', () => {
    expect(teamGoesLine({ ...base, contents: { site_count: 1, domains: ['example.com'], plan_id: 'price_123' } }))
      .toBe('The team Acme, with everyone in it, its site (example.com) and its Pro plan.')
    expect(teamGoesLine({ ...base, contents: { site_count: 0, domains: [] } })).toBe('The team Acme, with everyone in it.')
    expect(teamGoesLine(base)).toBe('The team Acme, with everyone in it and everything in it.')
  })
  it('alone', () => {
    expect(aloneGoesLine({ ...base, contents: { site_count: 1, domains: ['example.com'], plan_id: 'solo' } })).toBe('Your sites (example.com) and your Solo plan')
    expect(aloneGoesLine({ ...base, contents: { site_count: 0, domains: [] } })).toBe('Your sites (you have none yet)')
    expect(aloneGoesLine(base)).toBe('Your sites and everything in them')
  })
})

describe('a device\'s apps', () => {
  it('read in one order, unknown ids dropped', () => {
    expect(describeApps(['id', 'pulse-app'])).toBe('Pulse and Ciphera ID')
    expect(describeApps(['link', 'id', 'pulse-app', 'nope'])).toBe('Pulse, Ciphera ID and Link')
    expect(describeApps(['nope'])).toBe('')
  })
})

describe('times (copy deck §2)', () => {
  const now = Date.parse('2026-11-06T12:00:00Z')
  it('ago', () => {
    expect(agoLabel('2026-11-06T11:33:00Z', 'UTC', now)).toBe('27 min ago')
    expect(agoLabel('2026-11-06T09:00:00Z', 'UTC', now)).toBe('3 h ago')
    expect(agoLabel('2026-11-04T12:00:00Z', 'UTC', now)).toBe('2 days ago')
    expect(agoLabel('2026-09-01T12:00:00Z', 'UTC', now)).toBe('on 1 Sep')
  })
  it('day groups', () => {
    const today = new Date(now)
    expect(dayGroupLabel('2026-11-06T01:00:00Z', 'UTC', today)).toBe('Today')
    expect(dayGroupLabel('2026-11-05T23:00:00Z', 'UTC', today)).toBe('Yesterday')
    expect(dayGroupLabel('2026-11-03T10:00:00Z', 'UTC', today)).toBe('3 Nov')
    expect(dayGroupLabel('2025-11-03T10:00:00Z', 'UTC', today)).toBe('3 Nov 2025')
  })
  it('a link\'s expiry', () => {
    expect(expiryPhrase(null, now)).toBe('It expires 30 min after it was sent.')
    expect(expiryPhrase('2026-11-06T12:20:00Z', now)).toBe('It expires in about 20 min.')
    expect(expiryPhrase('2026-11-06T11:59:00Z', now)).toBe('It may have expired.')
  })
})
