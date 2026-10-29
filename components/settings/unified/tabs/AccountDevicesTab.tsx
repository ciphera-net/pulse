'use client'

import DevicesPanel from '@/components/settings/security/DevicesPanel'
import SecurityActivityCard from '@/components/settings/SecurityActivityCard'

/**
 * Account · Devices (16-10-2026, OPS-17: one devices list). The shell draws
 * the "Account · Devices" masthead, so this tab renders no title of its own:
 * just the two panels, Devices then Security activity. No masthead action:
 * devices are created implicitly on sign-in, so there is no primary action to
 * portal.
 */
export default function AccountDevicesTab() {
  return (
    <div className="space-y-8">
      <DevicesPanel />
      <SecurityActivityCard />
    </div>
  )
}
