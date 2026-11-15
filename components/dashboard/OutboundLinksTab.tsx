'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import { ArrowSquareOut } from '@phosphor-icons/react'
import CardEmptyState from '@/components/dashboard/CardEmptyState'
import { CardFooter, FRAME_CARD_BODY, FRAME_CARD_NOTE } from '@/lib/dashboard/frame'
import { ErrorCard } from '@/components/ui/ErrorCard'
import { CardPager, useCardPage } from '@/components/dashboard/CardPager'
import { CascadeGroup, CascadeRow, RowBar } from '@/components/dashboard/Cascade'
import { CompactNumber } from '@/components/ui/compact-number'
import { DIMENSION_ROW, ROW_NUMBER, ROW_SHARE, ROW_STAT } from '@/components/dashboard/MetricRowStat'
import { OUTBOUND_NATIVE_ONLY } from '@/components/dashboard/Outbound'
import { outboundLinkRows } from '@/lib/dashboard/outbound'
import { useOutboundUrls } from '@/lib/swr/dashboard'
import { type GoalCountStat, type ImportedProvenance } from '@/lib/api/stats'
import { usePreloadImages } from '@/lib/hooks/usePreloadImages'
import { getReferrerFavicon, getReferrerIcon } from '@/lib/utils/icons'

// ---------------------------------------------------------------------------
// The Pages block's fourth tab in the new dashboard frame: Outbound (15-11-2026).
//
// Where people go when they leave stands beside where they leave from (Exits), in the block's own rows: the link
// as one line of text, the bar, the share under the pointer, the number. It is the Outbound card's Links list and
// nothing else of that card: no dimmed path, and its Domains and From page lists are not here. A row carries its
// destination's icon, drawn as a referrer's is in Sources (the owner, 15-11-2026: "like we do everywhere else"):
// the house's own artwork for a site it knows (Instagram, YouTube), the site's favicon through the app's proxy
// for any other, the globe where there is none. The Outbound card asks the proxy for every host, which has no
// icon for some of the sites the house draws itself.
//
// What it keeps from that card, because each is a fact and not a style:
//   - the number is CLICKS (a visitor who clicked twice counts twice), and the block's header says so;
//   - a row opens its link in a new tab: there is no outbound dimension to filter by;
//   - the page's filter does not reach this read, so under a filter the footer says these are whole-site clicks;
//   - with imported days in range the footer says the rows are Pulse's own;
//   - a site whose Outbound links option is off says that, where it would otherwise say "no clicks".
//
// It renders the block's body AND its footer row, which is what a tab of this block owns.
// ---------------------------------------------------------------------------

const LIMIT = 7
/** Longest bar = 75% of the row, the house cap (as rowBarWidth). */
const BAR_CAP = 75

/** Under a page filter. The Outbound card's line, with a colon where it has a dash. */
export const OUTBOUND_NOT_FILTERED = 'Outbound is not filtered yet: these are whole-site clicks.'

/** A destination's icon, by the Sources block's own rules (lib/utils/icons.tsx): one drawing for one site, wherever it is listed. */
function DestinationIcon({ host, failed, onFail }: { host: string; failed: boolean; onFail: () => void }) {
  const url = getReferrerFavicon(host)
  if (url && !failed) {
    return (
      <Image
        src={url}
        alt=""
        width={20}
        height={20}
        className="w-5 h-5 flex-shrink-0 rounded-none object-contain"
        // Eager and decoded with the row, as in Sources: the row's page flip is the only moment the icon is looked at.
        loading="eager"
        decoding="sync"
        onError={onFail}
        // A 16 px answer is the proxy's own stand-in for "no icon": the house icon is drawn instead, as in Sources.
        onLoad={(e) => {
          if (e.currentTarget.naturalWidth <= 16) onFail()
        }}
        unoptimized
      />
    )
  }
  return <span className="w-5 h-5 flex-shrink-0 flex items-center justify-center">{getReferrerIcon(host)}</span>
}

export interface OutboundLinksTabProps {
  siteId: string
  dateRange: { start: string; end: string }
  period?: string
  /** The dashboard fan-out's goal counts: the `outbound_link` row is every outbound click of the range. */
  goalCounts?: GoalCountStat[]
  goalsImported?: ImportedProvenance | null
  /** Active page filters. The read takes none: the footer says so. */
  filters?: string
  live?: boolean
  liveMinutes?: number
  /** The site's "Outbound links" option is off (Site settings, General). */
  trackingOff?: boolean
}

export default function OutboundLinksTab({ siteId, dateRange, period, goalCounts, goalsImported, filters, live = false, liveMinutes, trackingOff = false }: OutboundLinksTabProps) {
  // Mounted only while its tab is open, so the read is made on the first visit to the tab and not with the page.
  const { data, error, isLoading } = useOutboundUrls(siteId, dateRange.start, dateRange.end, period, liveMinutes)
  const rows = useMemo(() => outboundLinkRows(data), [data])

  // The share's denominator is EVERY outbound click of the range, the native part of the goal count where the
  // server says which that is (an import can add clicks no row here can show). The summed rows are the fallback.
  const outboundGoal = goalCounts?.find((g) => g.event_name === 'outbound_link')
  const summed = useMemo(() => rows.reduce((n, r) => n + r.clicks, 0), [rows])
  const totalClicks = outboundGoal ? (outboundGoal.native_count ?? outboundGoal.count) : summed
  const maxClicks = rows.reduce((m, r) => Math.max(m, r.clicks), 0)

  const pageCount = Math.max(1, Math.ceil(rows.length / LIMIT))
  const [page, setPage] = useCardPage(`outbound|${filters ?? ''}|${dateRange.start}|${dateRange.end}|${liveMinutes ?? ''}`, pageCount)
  const displayed = rows.slice((page - 1) * LIMIT, page * LIMIT)
  // An icon that failed to load once is the globe for good, so it is not asked for again on every draw.
  const [faviconFailed, setFaviconFailed] = useState<Set<string>>(() => new Set())
  // This page's favicons and its neighbours', asked for before a page flip needs them.
  usePreloadImages(rows.slice(Math.max(0, (page - 2) * LIMIT), (page + 1) * LIMIT).map((row) => getReferrerFavicon(row.host)))
  const emptySlots = Math.max(0, LIMIT - displayed.length)
  const hasData = rows.length > 0

  // Never both notes: under a filter nothing imported is merged in, so the filter's note is the one that is true.
  const footnote = filters ? OUTBOUND_NOT_FILTERED : goalsImported?.included === true ? OUTBOUND_NATIVE_ONLY : null

  return (
    <>
      <div className={FRAME_CARD_BODY}>
        {error && !hasData ? (
          // Rows outlive a failed refresh. With nothing to show, an error is an error and never "no clicks yet".
          <ErrorCard title="Couldn't load outbound links" description="The outbound clicks did not arrive. Reload the page to try again." />
        ) : hasData ? (
          <CascadeGroup flipKey={`outbound-${page}`} className="space-y-2">
            {displayed.map((row, i) => {
              const width = maxClicks > 0 ? (row.clicks / maxClicks) * BAR_CAP : 0
              const share = totalClicks > 0 ? `${Math.round((row.clicks / totalClicks) * 100)}%` : ''
              return (
                <CascadeRow key={row.href} index={i}>
                  <a
                    href={row.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open ${row.label} in a new tab`}
                    className={`interactive-row ${DIMENSION_ROW} cursor-pointer`}
                    data-testid="outbound-link-row"
                  >
                    <RowBar width={width} index={i} />
                    <div className="relative flex-1 min-w-0 text-white flex items-center gap-3">
                      <DestinationIcon
                        host={row.host}
                        failed={faviconFailed.has(row.host)}
                        onFail={() => setFaviconFailed((prev) => new Set(prev).add(row.host))}
                      />
                      <span className="truncate" title={row.href}>{row.label}</span>
                      {/* The Pages rows' own arrow: hidden at rest, shown by the row's hover or focus, always on
                          touch, and orange under the pointer like every outbound arrow (PUL-22). Here it is the
                          row's own sign (the whole row opens the link), not a second control: the p-1 -m-1 box is
                          the Pages arrow's 22 px, so the orange starts where it does there. */}
                      <span
                        aria-hidden="true"
                        data-testid="outbound-link-arrow"
                        className="-m-1 shrink-0 p-1 text-neutral-500 opacity-0 transition ease-apple hover:text-brand-ink group-hover:opacity-100 group-focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
                      >
                        <ArrowSquareOut className="h-3.5 w-3.5" />
                      </span>
                    </div>
                    <div className={`${ROW_STAT} gap-2`}>
                      {share && <span className={ROW_SHARE}>{share}</span>}
                      <CompactNumber value={row.clicks} className={ROW_NUMBER} />
                    </div>
                  </a>
                </CascadeRow>
              )
            })}
            {Array.from({ length: emptySlots }).map((_, i) => (
              <div key={`empty-${i}`} className="h-9 px-2 -mx-2" aria-hidden="true" />
            ))}
          </CascadeGroup>
        ) : isLoading && !data ? (
          // Height-stable while the first read is on its way: the tab must not say "no clicks" for that moment.
          <div className="space-y-2" aria-busy="true">
            {Array.from({ length: LIMIT }).map((_, i) => (
              <div key={`loading-${i}`} className="h-9 px-2 -mx-2" aria-hidden="true" />
            ))}
          </div>
        ) : (
          <CardEmptyState
            live={live}
            icon={<ArrowSquareOut />}
            kind="outbound clicks"
            fresh="Clicks on links to other sites are listed here."
            // The page's filter does not reach this read, so an empty tab is never the filter's doing.
            filterable={false}
            off={trackingOff ? { title: 'Outbound links are switched off', description: 'This site does not record clicks on links to other sites.' } : null}
          />
        )}
      </div>

      <CardFooter>
        {hasData && footnote && (
          <p className={FRAME_CARD_NOTE} title={footnote} data-testid="outbound-footnote">{footnote}</p>
        )}
        <CardPager page={page} pageCount={pageCount} onPageChange={setPage} label="links" />
      </CardFooter>
    </>
  )
}
