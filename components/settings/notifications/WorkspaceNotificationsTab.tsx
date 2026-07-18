'use client'
import Link from 'next/link'
import CategoryTogglesSection from './CategoryTogglesSection'
import WebhooksSection from './WebhooksSection'

export default function WorkspaceNotificationsTab() {
  return (
    <div className="space-y-8">
      {/* Personal preferences moved to Account (spec §5.2). Old links that
          expected the "My preferences" sub-tab here land on the workspace side;
          this points people to their personal settings. Kept from P1; rendered
          neutral so the tab's single orange stays the Webhooks CTA. */}
      <p className="text-sm text-muted-foreground">
        Looking for your personal notification preferences?{' '}
        <Link
          href="/settings/account/notifications"
          className="font-medium text-foreground underline underline-offset-4 decoration-border hover:decoration-foreground"
        >
          Account · Notifications
        </Link>
      </p>

      <CategoryTogglesSection />
      <WebhooksSection />
    </div>
  )
}
