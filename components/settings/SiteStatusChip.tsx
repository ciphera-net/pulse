import { formatRelativeTime } from '@/lib/utils/formatDate'
import { StatusChip } from '@/components/settings/StatusChip'
import type { Site } from '@/lib/api/sites'

/**
 * SiteStatusChip — the band's one live-state signal, driven by the server's
 * `install_status` (derived server-side from `first_event_at`/`last_event_at`;
 * see pulse-backend Site.MarshalJSON — no clientside recency math). Verification
 * is a manual step, so while a site is unverified the priority is to verify it:
 * we keep the amber "Unverified" chip. Once verified, the band reports the LIVE
 * truth — a green "Receiving data" dot when events are current, a muted "No
 * recent data" / "No data yet" dot otherwise — with the exact last-event age on
 * hover. A green dot is not decoration: it means data is flowing right now.
 */
export function SiteStatusChip({ site }: { site: Site }) {
  if (!site.is_verified) {
    return <StatusChip tone="warning">Unverified</StatusChip>
  }

  const lastEventTitle = site.last_event_at
    ? `Last event ${formatRelativeTime(site.last_event_at)}`
    : undefined

  switch (site.install_status) {
    case 'active':
      return (
        <StatusChip tone="success" dot title={lastEventTitle}>
          Receiving data
        </StatusChip>
      )
    case 'stalled':
      return (
        <StatusChip tone="neutral" dot title={lastEventTitle}>
          No recent data
        </StatusChip>
      )
    case 'never_installed':
      return (
        <StatusChip tone="neutral" dot>
          No data yet
        </StatusChip>
      )
    default:
      // The backend always derives install_status; this only guards a missing
      // signal (older payload / test fixture). Report what we DO know —
      // verified — rather than fabricate a data state.
      return (
        <StatusChip tone="success" dot>
          Verified
        </StatusChip>
      )
  }
}
