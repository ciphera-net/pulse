'use client'

import ProfileSettings from '@/components/settings/ProfileSettings'

export default function AccountSecurityTab() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-white mb-1">Security</h3>
        <p className="text-sm text-neutral-400">Manage your password and two-factor authentication.</p>
      </div>

      <ProfileSettings activeTab="security" borderless />
    </div>
  )
}
