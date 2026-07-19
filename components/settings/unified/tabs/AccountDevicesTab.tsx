'use client'

import TrustedDevicesCard from '@/components/settings/TrustedDevicesCard'
import SecurityActivityCard from '@/components/settings/SecurityActivityCard'

/**
 * Account · Devices (spec §6). The section masthead ("Account") owns the page
 * title and lede — this tab renders only its two ruled-list sections, which
 * share ONE row idiom (the Facet RuledTable). No masthead CTA: devices are
 * created implicitly on sign-in, so there is no primary action to portal.
 */
export default function AccountDevicesTab() {
  return (
    <div className="space-y-8">
      <TrustedDevicesCard />
      <SecurityActivityCard />
    </div>
  )
}
