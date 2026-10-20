'use client'

import type { ReactNode } from 'react'
import { EmptyState } from '@/components/ui/EmptyState'
import { InstrumentOffState, type InstrumentOffStateProps } from '@/components/ui/InstrumentOffState'
import { useCan } from '@/lib/auth/permissions'
import { canWrite, useSiteScope, type SitePage, type SiteScope } from '@/lib/scope/SiteScope'

// ---------------------------------------------------------------------------
// The Search and CDN pages have three states whose words and controls depend on WHO
// is looking (PUL-34 Phase 2: /demo and /share/<id> render these same pages, in a
// public scope, beside the member's). Kept in one place so the two pages cannot
// disagree about them.
//
//  - `scopeServes`: whether the scope can serve the page at all;
//  - `PageUnavailable`: what a page says when it cannot, instead of a skeleton that
//    never resolves or an error card for a request that was never going to work;
//  - `IntegrationOffState`: an integration that is not connected. A member is offered
//    the way to connect it; a public visitor is told it is not connected, with
//    nothing to click (a write control is absent in public mode, never disabled).
// ---------------------------------------------------------------------------

/**
 * Whether this scope serves a page. Search and CDN read the integrations' own routes,
 * which the backend answers at full fidelity only: for a member, and for the sample
 * site. A share link on any other site is public-scoped and answers 404 "This page is
 * not shared" to every one of them, so those pages say so up front and read nothing.
 */
export function scopeServes(scope: Pick<SiteScope, 'fidelity' | 'pages'>, page: SitePage): boolean {
  return scope.fidelity === 'full' && scope.pages.includes(page)
}

/** What a page shows when its scope does not serve it. */
export function PageUnavailable({ title, icon }: { title: string; icon: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-white">{title}</h1>
      </div>
      <EmptyState
        icon={icon}
        title="This page is not shared"
        description="Only the pages shared on this link are available."
      />
    </div>
  )
}

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
