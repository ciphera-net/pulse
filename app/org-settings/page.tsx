import { Suspense } from 'react'
import OrganizationSettings from '@/components/settings/OrganizationSettings'

export const metadata = {
  title: 'Organization Settings - Pulse',
  description: 'Manage your organization settings',
}

export default function OrgSettingsPage() {
  return (
    <div className="min-h-screen pt-24 pb-12 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto">
        <Suspense fallback={<div className="p-8 text-center text-neutral-500">Loading...</div>}>
          <OrganizationSettings />
        </Suspense>
      </div>
    </div>
  )
}
