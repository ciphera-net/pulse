'use client'

import TrustedDevicesCard from '@/components/settings/TrustedDevicesCard'
import SecurityActivityCard from '@/components/settings/SecurityActivityCard'

/**
 * Account · Devices (spec §6.1). The shell draws the "Account · Devices"
 * masthead, so this tab renders no title of its own: just the two panels
 * (trusted devices, security activity), each a Facet Table inside a
 * SettingsPanel. No masthead action: devices are created implicitly on
 * sign-in, so there is no primary action to portal.
 */
export default function AccountDevicesTab() {
  return (
    <div className="space-y-8">
      <TrustedDevicesCard />
      <SecurityActivityCard />
    </div>
  )
}
