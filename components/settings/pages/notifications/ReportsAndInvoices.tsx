'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Button, buttonVariants } from '@ciphera-net/facet'
import { Files } from '@phosphor-icons/react'
import { useAuth } from '@/lib/auth/context'
import { useCan } from '@/lib/auth/permissions'
import { getScheduleSummary } from '@/lib/api/reports'
import { SETTINGS_PAGES, type SettingsPageKey } from '@/components/settings/nav'
import { KitRow, KitRows, KitSection, KitStatus } from '@/components/settings/kit/Kit'
import { cn } from '@/lib/utils'

/**
 * Reports and invoices (R42, option G): the team's two emails stay where they are made, scheduled emails in Sharing
 * and the billing email in Billing, and this page says so with a row and a button to each. The scheduled emails row
 * leads with how many run across the team's sites (R24); the billing email row never shows the address.
 */

function hrefOf(key: SettingsPageKey): string {
  const page = SETTINGS_PAGES.find((p) => p.key === key)
  if (!page) throw new Error(`No settings page "${key}"`)
  return page.href
}

const SHARING_HREF = hrefOf('sharing')
const BILLING_HREF = hrefOf('billing')
const LINK_BUTTON = cn(buttonVariants({ variant: 'outline', size: 'sm' }))

/** What the row can say about the team's scheduled emails. */
type Running =
  | { kind: 'unread' } // this person may not read them (the list needs analytics.export)
  | { kind: 'counting' }
  | { kind: 'counted'; n: number }
  | { kind: 'failed' }

// Every site's schedules, added up by the server in one read, over the sites this person can open. An answer that is
// not a count is a failed read, never a number on the row.
async function countSchedules(): Promise<number> {
  const { running } = await getScheduleSummary()
  if (!Number.isInteger(running) || running < 0) throw new Error('The scheduled email count is not a count')
  return running
}

function useRunningSchedules(): Running {
  const { user } = useAuth()
  const canRead = useCan('analytics.export')
  // Keyed by team, so another team's count is never shown while this one's is read.
  const { data, error } = useSWR(
    canRead && user ? ['settings-notifications-schedule-count', user.org_id ?? null] : null,
    countSchedules,
    { revalidateOnFocus: false },
  )
  if (!canRead) return { kind: 'unread' }
  if (error) return { kind: 'failed' }
  if (data === undefined) return { kind: 'counting' }
  return { kind: 'counted', n: data }
}

/** The state that leads the row's line (R24); nothing while counting, or for someone who may not read the list. */
function runningStatus(running: Running): ReactNode {
  switch (running.kind) {
    case 'counted':
      return running.n > 0 ? <KitStatus tone="live">{`${running.n} running`}</KitStatus> : <KitStatus tone="off">None yet</KitStatus>
    case 'failed':
      return <KitStatus tone="broken">{"Couldn't count them"}</KitStatus>
    case 'counting':
    case 'unread':
      return null
  }
}

export function ReportsAndInvoices({ alone }: { alone: boolean }) {
  const status = runningStatus(useRunningSchedules())
  // The Billing page is listed only for people who can see billing; for anyone else its button is dimmed (R24).
  const canSeeBilling = useCan('billing.view')

  return (
    <KitSection
      title="Reports and invoices"
      description={alone ? 'You set these up in Sharing and Billing.' : 'Your team sets these up in Sharing and Billing.'}
      icon={<Files />}
    >
      <KitRows>
        <div data-notif-pointer="schedules">
          <KitRow
            label="Scheduled emails"
            caption={<>{status}{status && ' · '}Growth reports emailed on the 1st, set up for each site in Sharing.</>}
            control={
              <Link href={SHARING_HREF} className={LINK_BUTTON}>
                Open Sharing
              </Link>
            }
          />
        </div>
        <div data-notif-pointer="billing">
          <KitRow
            label="Billing email"
            caption={`Invoices, failed payments and refunds go to ${alone ? 'your' : "the team's"} billing email, set in Billing.`}
            control={
              canSeeBilling ? (
                <Link href={BILLING_HREF} className={LINK_BUTTON}>
                  Open Billing
                </Link>
              ) : (
                <Button variant="outline" size="sm" disabled>
                  Open Billing
                </Button>
              )
            }
          />
        </div>
      </KitRows>
    </KitSection>
  )
}
