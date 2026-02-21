import { Suspense } from 'react'
import OrganizationSettings from '@/components/settings/OrganizationSettings'

export const metadata = {
  title: 'Organization Settings - Pulse',
  description: 'Manage your organization settings',
}

export default function OrgSettingsPage() {
  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <div>
        <Suspense fallback={<div className="p-8 text-center text-neutral-500">Loading...</div>}>
          <OrganizationSettings />
        </Suspense>
      </div>
    </div>
  )
}
