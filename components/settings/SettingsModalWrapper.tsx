'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { SettingsModal, type SettingsSection } from '@ciphera-net/ui'
import { UserIcon, LockIcon, BellIcon, ChevronRightIcon } from '@ciphera-net/ui'
import { NotificationToggleList, type NotificationOption } from '@ciphera-net/ui'
import ProfileSettings from '@/components/settings/ProfileSettings'
import TrustedDevicesCard from '@/components/settings/TrustedDevicesCard'
import SecurityActivityCard from '@/components/settings/SecurityActivityCard'
import { useSettingsModal } from '@/lib/settings-modal-context'
import { useAuth } from '@/lib/auth/context'
import { updateUserPreferences } from '@/lib/api/user'

// --- Security Alerts ---

const SECURITY_ALERT_OPTIONS: NotificationOption[] = [
  { key: 'login_alerts', label: 'Login Activity', description: 'New device sign-ins and suspicious login attempts.' },
  { key: 'password_alerts', label: 'Password Changes', description: 'Password changes and session revocations.' },
  { key: 'two_factor_alerts', label: 'Two-Factor Authentication', description: '2FA enabled/disabled and recovery code changes.' },
]

function SecurityAlertsCard() {
  const { user } = useAuth()
  const [emailNotifications, setEmailNotifications] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (user?.preferences?.email_notifications) {
      setEmailNotifications(user.preferences.email_notifications)
    } else {
      const defaults = SECURITY_ALERT_OPTIONS.reduce((acc, option) => ({
        ...acc,
        [option.key]: true
      }), {} as Record<string, boolean>)
      setEmailNotifications(defaults)
    }
  }, [user])

  const handleToggle = async (key: string) => {
    const newState = {
      ...emailNotifications,
      [key]: !emailNotifications[key]
    }
    setEmailNotifications(newState)
    try {
      await updateUserPreferences({
        email_notifications: newState as { new_file_received: boolean; file_downloaded: boolean; login_alerts: boolean; password_alerts: boolean; two_factor_alerts: boolean }
      })
    } catch {
      setEmailNotifications(prev => ({
        ...prev,
        [key]: !prev[key]
      }))
    }
  }

  return (
    <NotificationToggleList
      title="Security Alerts"
      description="Choose which security events trigger email alerts"
      icon={<BellIcon className="w-5 h-5 text-brand-orange" />}
      options={SECURITY_ALERT_OPTIONS}
      values={emailNotifications}
      onToggle={handleToggle}
    />
  )
}

// --- Notification Center Placeholder ---

function NotificationCenterPlaceholder() {
  return (
    <div className="text-center max-w-md mx-auto py-8">
      <BellIcon className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
      <h3 className="text-lg font-medium text-white mb-2">Notification Center</h3>
      <p className="text-sm text-neutral-500 mb-4">View and manage all your notifications in one place.</p>
      <Link href="/notifications" className="inline-flex items-center gap-2 px-4 py-2 bg-brand-orange text-white rounded-lg hover:bg-brand-orange/90 transition-colors">
        Open Notification Center
        <ChevronRightIcon className="w-4 h-4" />
      </Link>
    </div>
  )
}

// --- Main Wrapper ---

export default function SettingsModalWrapper() {
  const { isOpen, closeSettings } = useSettingsModal()

  const sections: SettingsSection[] = [
    {
      id: 'pulse',
      label: 'Account',
      icon: UserIcon,
      defaultExpanded: true,
      items: [
        { id: 'profile', label: 'Profile', content: <ProfileSettings activeTab="profile" borderless hideDangerZone /> },
        { id: 'security', label: 'Security', content: <ProfileSettings activeTab="security" borderless /> },
        { id: 'preferences', label: 'Preferences', content: <ProfileSettings activeTab="preferences" borderless /> },
        { id: 'danger-zone', label: 'Danger Zone', content: <ProfileSettings activeTab="danger-zone" borderless /> },
      ],
    },
    {
      id: 'security-section',
      label: 'Security',
      icon: LockIcon,
      items: [
        { id: 'devices', label: 'Trusted Devices', content: <TrustedDevicesCard /> },
        { id: 'activity', label: 'Security Activity', content: <SecurityActivityCard /> },
      ],
    },
    {
      id: 'notifications',
      label: 'Notifications',
      icon: BellIcon,
      items: [
        { id: 'security-alerts', label: 'Security Alerts', content: <SecurityAlertsCard /> },
        { id: 'center', label: 'Notification Center', content: <NotificationCenterPlaceholder /> },
      ],
    },
  ]

  return <SettingsModal open={isOpen} onClose={closeSettings} sections={sections} />
}
