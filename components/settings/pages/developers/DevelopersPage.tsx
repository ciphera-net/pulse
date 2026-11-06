'use client'

import { LockSimple } from '@phosphor-icons/react'
import { KitPage, KitSection } from '@/components/settings/kit/Kit'
import { useCan } from '@/lib/auth/permissions'
import { ApiKeysSection } from './ApiKeysSection'
import { AssistantsSection, ConnectedAssistantsSection } from './AssistantsSections'

/**
 * Developers (settings overhaul, round 9; copy deck §11): today's API Keys and MCP pages as one. API keys, then the AI
 * assistants' setup, then the assistants connected. Both halves need `integrations.manage`, as the server's routes do;
 * a member gets the no-access state (§11.4) and nothing is read.
 */
export default function DevelopersPage() {
  const canManage = useCan('integrations.manage')
  if (!canManage) {
    return (
      <KitPage>
        <KitSection
          title="No access to Developers"
          description="Only the owner and admins can use this page. Ask the team's owner if you need it."
          icon={<LockSimple />}
        />
      </KitPage>
    )
  }
  return (
    <KitPage>
      <ApiKeysSection />
      <AssistantsSection />
      <ConnectedAssistantsSection />
    </KitPage>
  )
}
