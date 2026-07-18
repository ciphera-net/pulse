'use client'
import Link from 'next/link'
import CategoryTogglesSection from './CategoryTogglesSection'
import WebhooksSection from './WebhooksSection'

export default function WorkspaceNotificationsTab() {
  return (
    <div className="space-y-8">
      {/* Personal preferences moved to Account (spec §5.2). Old links that
          expected the "My preferences" sub-tab here land on the workspace side;
          this points people to their personal settings. */}
      <p className="text-sm text-muted-foreground">
        Looking for your personal preferences?{' '}
        <Link href="/settings/account/notifications" className="text-primary hover:underline">
          Go to Account · Notifications →
        </Link>
      </p>

      <section>
        <h3 className="text-base font-semibold text-white mb-1">Categories enabled for this workspace</h3>
        <p className="text-xs text-neutral-500 mb-3">Disable an entire category for everyone in the workspace.</p>
        <CategoryTogglesSection />
      </section>

      <section>
        <h3 className="text-base font-semibold text-white mb-1">Webhook destinations</h3>
        <WebhooksSection />
      </section>
    </div>
  )
}
