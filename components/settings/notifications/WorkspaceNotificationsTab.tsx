'use client'
import CategoryTogglesSection from './CategoryTogglesSection'
import WebhooksSection from './WebhooksSection'

export default function WorkspaceNotificationsTab() {
  return (
    <div className="space-y-8">
      <section>
        <h3 className="font-medium text-white mb-1">Categories enabled for this workspace</h3>
        <p className="text-xs text-neutral-500 mb-3">Disable an entire category for everyone in the workspace.</p>
        <CategoryTogglesSection />
      </section>

      <section>
        <h3 className="font-medium text-white mb-1">Webhook destinations</h3>
        <WebhooksSection />
      </section>
    </div>
  )
}
