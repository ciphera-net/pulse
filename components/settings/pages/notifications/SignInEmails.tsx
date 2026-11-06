'use client'

import { useEffect, useState } from 'react'
import { Toggle, toast } from '@ciphera-net/facet'
import { SignIn } from '@phosphor-icons/react'
import { useAuth } from '@/lib/auth/context'
import { updateUserPreferences, type UserPreferences } from '@/lib/api/user'
import { KitBlock, KitRow, KitRows, KitSection } from '@/components/settings/kit/Kit'

/**
 * The sign-in emails Ciphera ID sends (copy deck §12.7, moved here by R41). These are preferences on the ID user, not
 * Pulse's groups: a different system with its own read (the session's user) and its own write.
 *
 * - The three switches ARE enforced since ciphera-id#64 (03-09-2026), in `NotifySender.notify()`.
 * - Account locked has no switch because id-backend sends it with no preference gate. It is a row that says so: a page
 *   listing three of four emails tells the reader the fourth does not exist, and a dimmed switch would claim a control
 *   that is not there. The line under it names the other emails that are always sent.
 * - Absent means ON, server-side: id-backend omits a key it has never been given, so the switches hydrate from a
 *   defaults spread, never by reading a key directly.
 * - The PUT replaces the whole `email_notifications` block, so every save writes back the whole block as the server
 *   last sent it (keys this app never reads included) with only the flipped key changed.
 */

type EmailNotifications = UserPreferences['email_notifications']
type SignInKey = keyof EmailNotifications

const SIGN_IN_EMAILS: { key: SignInKey; label: string; caption: string }[] = [
  { key: 'login_alerts', label: 'New sign-ins', caption: 'A browser signs in for the first time, or again after it was signed out.' },
  {
    key: 'password_alerts',
    label: 'Password and recovery phrase',
    caption: 'Your password changed or was reset, or your recovery phrase was used or replaced.',
  },
  {
    key: 'two_factor_alerts',
    label: 'Two-factor and passkeys',
    caption: 'Two-factor turned on or off, a passkey added or removed, recovery codes replaced.',
  },
]

/** The server's default for every key: these emails are opt-out. */
const DEFAULTS: EmailNotifications = {
  login_alerts: true,
  password_alerts: true,
  two_factor_alerts: true,
}

export function SignInEmails() {
  const { user, refresh } = useAuth()
  const [settings, setSettings] = useState<EmailNotifications>(DEFAULTS)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (user?.preferences?.email_notifications) {
      setSettings({ ...DEFAULTS, ...user.preferences.email_notifications })
    }
  }, [user])

  const flip = async (key: SignInKey) => {
    const previous = settings
    const next = { ...settings, [key]: !settings[key] }
    // Optimistic: the switch answers the finger at once and goes back if the write fails, so it never shows a state
    // the server does not hold.
    setSettings(next)
    setSaving(true)
    try {
      await updateUserPreferences({ email_notifications: next })
      // Re-read so the session (and anything else reading preferences) holds the server's answer, not this guess.
      await refresh()
    } catch {
      setSettings(previous)
      toast.error("Couldn't save. Try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <KitSection title="Sign-in emails" description="Sent by Ciphera ID, the sign-in behind Pulse." icon={<SignIn />}>
      <KitRows>
        {SIGN_IN_EMAILS.map((e) => (
          <div key={e.key} data-notif-signin={e.key}>
            <KitRow
              label={e.label}
              caption={e.caption}
              control={
                <Toggle
                  checked={settings[e.key]}
                  disabled={saving}
                  aria-label={`Email for ${e.label}`}
                  onChange={() => void flip(e.key)}
                />
              }
            />
          </div>
        ))}
        <KitRow
          label="Account locked"
          caption="Ciphera ID locked your account after repeated wrong passwords or codes. Always sent, so someone holding your session can't turn it off."
          control={<span data-notif-always="" className="text-xs text-muted-foreground">Always sent</span>}
        />
        <KitBlock>
          <p data-notif-also="" className="text-xs text-muted-foreground">
            Email changes, a sign-in used twice and account deletion are always sent too.
          </p>
        </KitBlock>
      </KitRows>
    </KitSection>
  )
}
