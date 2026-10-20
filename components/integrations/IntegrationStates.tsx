'use client'

import type { ReactNode } from 'react'
import { EmptyState } from '@/components/ui/EmptyState'
import { InstrumentOffState, type InstrumentOffStateProps } from '@/components/ui/InstrumentOffState'
import { useCan } from '@/lib/auth/permissions'
import { canWrite, useSiteScope, type SitePage, type SiteScope } from '@/lib/scope/SiteScope'

// ---------------------------------------------------------------------------
// The Search and CDN pages have a state whose words and controls depend on WHO
// is looking (PUL-34 Phase 2: /demo and /share/<id> render these same pages, in a
// public scope, beside the member's). Kept in one place so the two pages cannot
// disagree about it. Whether a scope shows the page at all is servesPage (lib/scope/SiteScope.tsx),
// the rule every surface's gate asks.
//
//  - `IntegrationOffState`: an integration that is not connected. A member is offered
//    the way to connect it; a public visitor is told it is not connected, with
//    nothing to click (a write control is absent in public mode, never disabled).
// ---------------------------------------------------------------------------

interface IntegrationOffStateProps {
  /** Ghost rail labels, in rail order (the instrument's own metric names). */
  rails: string[]
  icon: ReactNode
  /** What a member sees: the way to connect it, or a line saying who can. */
  connect: {
    heading: string
    body: ReactNode
    actionLabel: string
    href: string
    fallback: string
  }
  /** What a public visitor sees: that it is not connected. */
  absent: {
    heading: string
    body: ReactNode
  }
}

// InstrumentOffState asks for an action even when `canAct` is false, in which case it
// never renders it. A public visitor is offered nothing, so this is the inert one.
const NO_ACTION: InstrumentOffStateProps['action'] = { label: 'Not available', onClick: () => undefined }

export function IntegrationOffState({ rails, icon, connect, absent }: IntegrationOffStateProps) {
  const scope = useSiteScope()
  if (!canWrite(scope)) {
    return (
      <InstrumentOffState
        rails={rails}
        icon={icon}
        heading={absent.heading}
        body={absent.body}
        canAct={false}
        action={NO_ACTION}
        fallback="Nothing to show yet."
      />
    )
  }
  return <ConnectPrompt rails={rails} icon={icon} connect={connect} />
}

// Its own component so the permission read happens only for a member: a public page
// never asks the member API what its visitor may do.
function ConnectPrompt({ rails, icon, connect }: Omit<IntegrationOffStateProps, 'absent'>) {
  const canManageIntegrations = useCan('integrations.manage')
  return (
    <InstrumentOffState
      rails={rails}
      icon={icon}
      heading={connect.heading}
      body={connect.body}
      canAct={canManageIntegrations}
      action={{ label: connect.actionLabel, href: connect.href }}
      fallback={connect.fallback}
    />
  )
}
