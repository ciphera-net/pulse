'use client'

import ProfileSettings from '@/components/settings/ProfileSettings'
import TrustedDevicesCard from '@/components/settings/TrustedDevicesCard'

export default function AccountProfileTab() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-white mb-1">Profile</h3>
        <p className="text-sm text-neutral-400">Manage your personal account settings.</p>
      </div>

      <ProfileSettings activeTab="profile" borderless />
    </div>
  )
}
