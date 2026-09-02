'use client'

import { useEffect, useState } from 'react'
import { Banner, Toggle, toast, getAuthErrorMessage } from '@ciphera-net/facet'
import { useAuth } from '@/lib/auth/context'
import { updateUserPreferences, type UserPreferences } from '@/lib/api/user'
import SettingsLoadingState from '@/components/settings/SettingsLoadingState'
import { SettingsPanel, PanelRow, PanelRows } from '@/components/settings/panels'
import { StatusChip } from '@/components/settings/StatusChip'

/**
 * Account · Security alerts (plan 02-09-2026 P4).
 *
 * The account-level email alerts Ciphera ID sends. They are preferences on the
 * ID user, not Pulse notification categories — `/settings/account/notifications`
 * is Pulse's own delivery matrix and is a different system entirely. This tab is
 * the Pulse-owned home for the three ID toggles, so the settings that belong to
 * the account can be reached from the app the account is used in. Facet ships a
 * notifications tab of its own inside `ProfileSettings`; it stays suppressed
 * (`hideNotifications`), the same as in id-frontend.
 *
 * 🔑 The alert set is FOUR, not three. id-backend sends
 * `id_suspicious_login_blocked` with no preference gate at all
 * (`internal/api/opaque_login.go`), so there is no toggle that could turn it
 * off. It is rendered as a read-only row rather than omitted: a settings page
 * that lists three of four alerts quietly tells the user the fourth does not
 * exist, and a disabled switch would imply a control we do not have.
 *
 * 🔴 AND NEITHER ARE THE OTHER THREE, TODAY. The preferences are stored and
 * served by id-backend, but nothing reads them before sending: every alert
 * call site fires unconditionally (`totp.go`, `opaque_settings.go`,
 * `opaque_login.go`, `recovery.go`, `recovery_opaque.go`), and Relay refuses
 * to make `id_*` mail suppressible at all — `internal/preferences/category.go`
 * lists exactly two suppressible templates and a test iterates the registry to
 * keep it that way. So the switches below write a real, persisted preference
 * that no sender consults yet. The banner says so. A control that silently
 * does nothing is the same defect as the profile banner that told people to
 * reload Pulse to restore their name; it does not get to ship unlabelled just
 * because the storage half works.
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
    label: 'Login activity',
    caption: 'Sign-ins from a new device.',
  },
  {
    key: 'password_alerts',
    label: 'Password changes',
    caption: 'Password changes and the session revocations that follow them.',
  },
  {
    key: 'two_factor_alerts',
    label: 'Two-factor authentication',
    caption: 'Two-factor turned on or off, and recovery-code changes.',
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

export default function AccountSecurityAlertsTab() {
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
      toast.error(getAuthErrorMessage(err as Error) || 'Failed to update security alerts')
    } finally {
      setSaving(false)
    }
  }

  // While the auth context is still hydrating, render the skeleton shaped like
  // the panel it will become — never a bare spinner (spec §2.3).
  if (!user) return <SettingsLoadingState rows={4} />

  return (
    <div className="space-y-8">
      {/* Not a disclaimer — a fact the user needs before they trust a switch.
          See the file docblock for the measurement behind it. */}
      <Banner tone="warning" title="These choices are saved, but not enforced yet">
        Ciphera ID sends every alert below whatever the switches say — no sender checks
        these preferences today. Your choice is recorded on your account, so it is not
        lost, but turning one off does not stop the email.
      </Banner>

      <SettingsPanel
        kicker="Security alerts"
        description="Emails Ciphera ID sends you when something changes on your account."
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
            caption="Sent whenever a sign-in is blocked as suspicious. This one has no preference at all — it is the warning a takeover victim gets while there is still time to act."
            control={<StatusChip tone="neutral">Always sent</StatusChip>}
          />
        </PanelRows>
      </SettingsPanel>
    </div>
  )
}
