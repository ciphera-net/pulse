import { Suspense } from 'react'
import ProfileSettings from '@/components/settings/ProfileSettings'
import CheckoutSuccessToast from '@/components/checkout/CheckoutSuccessToast'

export const metadata = {
  title: 'Settings - Pulse',
  description: 'Manage your account settings',
}

export default function SettingsPage() {
  return (
    <div className="min-h-screen pt-12 pb-12 px-4 sm:px-6">
      <Suspense fallback={null}>
        <CheckoutSuccessToast />
      </Suspense>
      <ProfileSettings />
    </div>
  )
}
