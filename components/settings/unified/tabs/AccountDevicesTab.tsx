'use client'

import TrustedDevicesCard from '@/components/settings/TrustedDevicesCard'
import SecurityActivityCard from '@/components/settings/SecurityActivityCard'

export default function AccountDevicesTab() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-white mb-1">Devices & Activity</h3>
        <p className="text-sm text-neutral-400">Manage trusted devices and review security activity.</p>
      </div>

      <TrustedDevicesCard />
      <SecurityActivityCard />
    </div>
  )
}
