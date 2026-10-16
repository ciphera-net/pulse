'use client'

import { useEffect, useState } from 'react'
import { Toggle, toast, getAuthErrorMessage } from '@ciphera-net/facet'
import { useAuth } from '@/lib/auth/context'
import { updateUserPreferences, type UserPreferences } from '@/lib/api/user'
import SettingsLoadingState from '@/components/settings/SettingsLoadingState'
import { SettingsPanel, PanelRow, PanelRows } from '@/components/settings/panels'
import { StatusChip } from '@/components/settings/StatusChip'

/**
 * "Your account" — the account-level email alerts Ciphera ID sends, embedded
 * in the Notifications tab (16-10-2026, OPS-17: Security alerts folded into
 * Notifications, option A of the options round). Previously its own tab at
 * /settings/account/security-alerts, which now redirects here.
 *
 * These are preferences on the ID user, not Pulse notification categories —
 * MyPreferencesTab's own "Email" panel is Pulse's delivery matrix and is a
 * different system entirely. This component is the logic AND the copy both
 * surfaces share, kept in one place rather than duplicated.
 *
 * 🔑 The alert set is FOUR, not three. id-backend sends
 * `id_suspicious_login_blocked` with no preference gate at all
 * (`internal/api/opaque_login.go`), so there is no toggle that could turn it
 * off. It is rendered as a read-only row rather than omitted: a settings page
 * that lists three of four alerts quietly tells the user the fourth does not
 * exist, and a disabled switch would imply a control we do not have.
 *
 * ✅ The other three ARE enforced, since ciphera-id#64 (03-09-2026). The gate
 * lives in `NotifySender.notify()` — one place, keyed by a category declared
 * beside each template name.
 *
 * ⚠️ Absent means ON, server-side. `DEFAULTS` below is not a cosmetic guess: a
 * user who has never opened this panel has `preferences = {}` and id-backend
 * omits the unset keys from the wire, so this spread and the server's own
 * default must agree or the switch shows a state the sender does not hold.
 *
 * The PUT replaces the whole `email_notifications` block, so every key must be
 * written back on every save — including the two the ID account system carries
 * from the file-transfer product it was first built for, which no alert reads
 * today. Sending a partial block resets them.
 */

type AlertKey = 'login_alerts' | 'password_alerts' | 'two_factor_alerts'

interface AlertOption {
  key: AlertKey
  label: string
  caption: string
}

const ALERT_OPTIONS: AlertOption[] = [
  {
    key: 'login_alerts',
    label: 'New sign-ins',
    caption: 'A browser signs in to your account for the first time.',
  },
  {
    key: 'password_alerts',
    label: 'Password changes',
    caption: 'Your password changed, and every device was signed out with it.',
  },
  {
    key: 'two_factor_alerts',
    label: 'Two-factor and passkeys',
    caption: 'Two-factor turned on or off, a passkey added or removed, recovery codes replaced.',
  },
]

type EmailNotifications = UserPreferences['email_notifications']

/** Server-side default for every key: alerts are opt-OUT. */
const DEFAULTS: EmailNotifications = {
  new_file_received: true,
  file_downloaded: true,
  login_alerts: true,
  password_alerts: true,
  two_factor_alerts: true,
}

export default function AccountSecurityAlertsPanel() {
  const { user, refresh } = useAuth()
  const [settings, setSettings] = useState<EmailNotifications>(DEFAULTS)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (user?.preferences?.email_notifications) {
      setSettings({ ...DEFAULTS, ...user.preferences.email_notifications })
    }
  }, [user])

  const handleToggle = async (key: AlertKey) => {
    const previous = settings
    const next = { ...settings, [key]: !settings[key] }
    // Optimistic: the switch answers the finger immediately and is put back
    // where it was if the write fails — never left showing a state the server
    // does not hold.
    setSettings(next)
    setSaving(true)
    try {
      await updateUserPreferences({ email_notifications: next })
      // Re-read so the context (and any other surface reading preferences)
      // holds the server's answer rather than this component's guess.
      await refresh()
    } catch (err) {
      setSettings(previous)
      toast.error(getAuthErrorMessage(err as Error) || "Couldn't update your account alerts. Try again.")
    } finally {
      setSaving(false)
    }
  }

  // While the auth context is still hydrating, render the skeleton shaped like
  // the panel it will become — never a bare spinner.
  if (!user) return <SettingsLoadingState rows={4} />

  return (
    <SettingsPanel
      title="Your account"
      description="Emails about signing in to your Ciphera account. They come from Ciphera ID, the sign-in behind Pulse."
    >
      <PanelRows>
        {ALERT_OPTIONS.map(option => (
          <PanelRow
            key={option.key}
            label={option.label}
            caption={option.caption}
            control={
              <Toggle
                checked={settings[option.key]}
                onChange={() => handleToggle(option.key)}
                disabled={saving}
              />
            }
          />
        ))}

        {/* Not a toggle, because there is no control behind it: id-backend
            sends this one unconditionally. Saying so is the honest surface —
            a disabled switch would advertise a setting that does not exist. */}
        <PanelRow
          label="Blocked sign-in attempts"
          caption="A sign-in blocked as suspicious. Always sent: it is the warning a takeover victim gets while there is still time to act."
          control={<StatusChip tone="neutral">Always sent</StatusChip>}
        />
      </PanelRows>
    </SettingsPanel>
  )
}
