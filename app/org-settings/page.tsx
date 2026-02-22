import { Suspense } from 'react'
import OrganizationSettings from '@/components/settings/OrganizationSettings'
import { SettingsFormSkeleton } from '@/components/skeletons'

export const metadata = {
  title: 'Organization Settings - Pulse',
  description: 'Manage your organization settings',
}

export default function OrgSettingsPage() {
  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <div>
        <Suspense fallback={
          <div className="space-y-8">
            <div>
              <div className="h-8 w-56 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800 mb-2" />
              <div className="h-4 w-80 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
            </div>
            <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-6 md:p-8">
              <SettingsFormSkeleton />
            </div>
          </div>
        }>
          <OrganizationSettings />
        </Suspense>
      </div>
    </div>
  )
}
