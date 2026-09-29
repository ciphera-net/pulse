import { TrendUp, TrendDown, ChartLineDown, ChartLineUp } from '@phosphor-icons/react'
import type { Receipt, SiteImportCompletedPayload, SiteImportStoppedCode, SiteImportStoppedPayload } from '@/lib/notifications/types'
import type { Rendered, Resolvers } from './index'
import { formatCalendarDate } from '@/lib/utils/formatDate'

/**
 * PULSE-121, design §3.10c M13-i: the in-app copy for both `site_import_*`
 * types. Consistent with the ruled email copy (C1 variant A, C2 variant A —
 * §3.10c) in what happened and why, shortened for a notification row: the
 * "how to fix it on the Import tab" trailing sentence is dropped because the
 * row's own click target IS the Import tab (linkLabel below), so the card
 * would otherwise say the same thing twice.
 *
 * Same guards as the email (§3.10c "Copy options"): no em or en dashes, no
 * contractions, no possessive 's, no "!". Dates are the SITE-local day the
 * payload already carries (`range_start`/`range_end`/`stopped_on`), read with
 * `formatCalendarDate` — the digits out of the wire string, never a `Date`
 * reformatted through a viewer timezone, so the day can never shift (the
 * exact class of bug `formatDate.ts`'s own comments record repeatedly).
 */
const IMPORT_LINK_LABEL = 'View import'

function siteImportDate(iso: string): string {
  return formatCalendarDate(iso) ?? iso
}

/**
 * One sentence per stop cause (M13-d's five, M13-j "copy ships for every
 * code now"), keyed as a `Record` so a sixth cause added to
 * `SiteImportStoppedCode` fails `tsc` here too — a THIRD exhaustiveness gate
 * alongside the icon map and the renderer registry, though this one is
 * local to this file rather than a `satisfies Record<NotificationType, …>`.
 */
const STOPPED_COPY: Record<SiteImportStoppedCode, (p: SiteImportStoppedPayload, date: string) => { title: string; body: string }> = {
  upload_abandoned: (p, date) => {
    // 🔴 part/parts are optional on the payload TYPE (they are omitted for
    // every other cause), but required for THIS one. A payload that claims
    // upload_abandoned without them is malformed — throw, so the caller
    // (renderNotification) degrades to the generic fallback card instead of
    // printing "part undefined of undefined".
    if (p.part == null || p.parts == null) {
      throw new Error('site_import_stopped: upload_abandoned payload has no part/parts')
    }
    return {
      title: `Your ${p.source_name} import stopped at part ${p.part} of ${p.parts}`,
      body: `The ${p.source_name} upload for ${p.domain} stopped at part ${p.part} of ${p.parts} on ${date}, because the tab running it was closed. Choose the same file and it carries on where it stopped.`,
    }
  },
  reconnect_required: (p, date) => ({
    title: `${p.source_name} stopped accepting the import connection`,
    body: `The ${p.source_name} import for ${p.domain} stopped on ${date}, because ${p.source_name} no longer accepts the connection from Pulse.`,
  }),
  source_unavailable: (p, date) => ({
    title: `${p.source_name} stopped answering the import`,
    body: `The ${p.source_name} import for ${p.domain} stopped on ${date}, because ${p.source_name} kept failing to answer.`,
  }),
  connector_erased: (p, date) => ({
    title: `The ${p.source_name} import for ${p.domain} needs a new connection`,
    body: `The import stopped on ${date}, because the account that connected ${p.source_name} was deleted.`,
  }),
  user_metrics_disabled: (p, date) => ({
    title: `${p.source_name} blocked the visitor counts`,
    body: `The ${p.source_name} import for ${p.domain} stopped on ${date}, because user metrics are turned off for that property.`,
  }),
}

export const siteRenderers = {
  site_added: (r: Receipt, resolvers?: Resolvers): Rendered => {
    const p = r.event.payload as { site_id: string }
    const siteName = resolvers ? resolvers.resolveSiteName(p.site_id) : `site ${p.site_id}`
    return {
      title: `Site added — ${siteName}`,
      body: 'Tracking script is live.',
      linkLabel: 'View site',
    }
  },
  site_tracking_issue: (r: Receipt, resolvers?: Resolvers): Rendered => {
    const p = r.event.payload as { site_id: string; issue_code: string }
    const siteName = resolvers ? resolvers.resolveSiteName(p.site_id) : `site ${p.site_id}`
    return {
      title: `Tracking script issue — ${siteName}`,
      body: `Issue code: ${p.issue_code}.`,
      linkLabel: 'View diagnostics',
    }
  },
  site_export_ready: (r: Receipt, resolvers?: Resolvers): Rendered => {
    const p = r.event.payload as { export_id: string; site_id: string }
    const siteName = resolvers ? resolvers.resolveSiteName(p.site_id) : `site ${p.site_id}`
    return {
      title: 'Export ready',
      body: `Your data export for ${siteName} is ready to download.`,
      linkLabel: 'Download',
    }
  },
  site_report_ready: (r: Receipt, resolvers?: Resolvers): Rendered => {
    const p = r.event.payload as { site_id: string; site_domain: string; report_name: string; period_label: string }
    const name = resolvers?.resolveSiteName?.(p.site_id) ?? p.site_domain
    return {
      title: `${p.report_name} is ready`,
      body: `The report for ${name}, ${p.period_label}.`,
      linkLabel: 'Open report',
    }
  },
  site_traffic_spike: (r: Receipt, resolvers?: Resolvers): Rendered => {
    const p = r.event.payload as { site_id: string; site_domain: string; current_visitors: number; baseline_visitors: number; change_percent: number }
    const name = resolvers?.resolveSiteName?.(p.site_id) ?? p.site_domain
    return {
      icon: <TrendUp className="w-5 h-5" />,
      title: `Traffic spike on ${name}`,
      body: `Visitors up ${Math.round(p.change_percent)}% vs 7-day average (${p.current_visitors} vs ${p.baseline_visitors}).`,
      linkLabel: 'View dashboard',
    }
  },
  site_traffic_drop: (r: Receipt, resolvers?: Resolvers): Rendered => {
    const p = r.event.payload as { site_id: string; site_domain: string; current_visitors: number; baseline_visitors: number; change_percent: number }
    const name = resolvers?.resolveSiteName?.(p.site_id) ?? p.site_domain
    return {
      icon: <TrendDown className="w-5 h-5" />,
      title: `Traffic drop on ${name}`,
      body: `Visitors down ${Math.abs(Math.round(p.change_percent))}% vs 7-day average (${p.current_visitors} vs ${p.baseline_visitors}).`,
      linkLabel: 'View dashboard',
    }
  },
  site_content_decay: (r: Receipt, resolvers?: Resolvers): Rendered => {
    const p = r.event.payload as { site_id: string; domain: string; pages: Array<{ path: string; peak_views: number; current_views: number; decay_pct: number }> }
    const name = resolvers?.resolveSiteName?.(p.site_id) ?? p.domain
    const count = p.pages?.length ?? 0
    const countLabel = count === 1 ? '1 page is' : `${count} pages are`
    const top = p.pages?.[0]
    const topDetail = top
      ? ` ${top.path} is down ${top.decay_pct}% (${top.current_views.toLocaleString()} vs ${top.peak_views.toLocaleString()} peak views).`
      : ''
    return {
      icon: <TrendDown className="w-5 h-5" />,
      title: `Content decay on ${name}`,
      body: `${countLabel} losing traffic.${topDetail}`,
      linkLabel: 'View details',
    }
  },
  site_pagespeed_drop: (r: Receipt, _resolvers?: Resolvers): Rendered => {
    const p = r.event.payload as { site_id: string; category_slug: string; score_before: number; score_after: number }
    const category = p.category_slug
      .split('_')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
    return {
      icon: <ChartLineDown className="w-5 h-5" />,
      title: 'Performance score dropped',
      body: `${category} score fell from ${p.score_before} to ${p.score_after}.`,
      linkLabel: 'View Performance',
    }
  },
  site_pagespeed_recovered: (r: Receipt, _resolvers?: Resolvers): Rendered => {
    const p = r.event.payload as { site_id: string; category_slug: string; score_before: number; score_after: number }
    const category = p.category_slug
      .split('_')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
    return {
      icon: <ChartLineUp className="w-5 h-5" />,
      title: 'Performance score recovered',
      body: `${category} score improved from ${p.score_before} to ${p.score_after}.`,
      linkLabel: 'View Performance',
    }
  },
  // PULSE-121, design §3.10c: a PULL import finished. Uploads never send this
  // (M13-d, Q-M13-2: the done screen is the receipt, the tab is open by
  // construction) — only a connected pull import's completion reaches here.
  site_import_completed: (r: Receipt): Rendered => {
    const p = r.event.payload as SiteImportCompletedPayload
    // A card cannot say something true from a payload missing the facts it
    // states as fact — throw, so renderNotification degrades to the generic
    // fallback instead of printing "undefined" into a sentence.
    if (!p.source_name || !p.domain || !p.range_start || !p.range_end) {
      throw new Error('site_import_completed: payload is missing a required field')
    }
    return {
      title: `Your ${p.source_name} history is in Pulse`,
      body: `Pulse finished importing the history of ${p.domain} from ${p.source_name}, ${siteImportDate(p.range_start)} to ${siteImportDate(p.range_end)}.`,
      linkLabel: IMPORT_LINK_LABEL,
    }
  },
  // PULSE-121, design §3.10c: an import stopped for one of M13-d's five
  // causes. `code` picks the sentence; an unrecognised code throws, which
  // renderNotification degrades to the generic fallback card rather than
  // printing something invented.
  site_import_stopped: (r: Receipt): Rendered => {
    const p = r.event.payload as SiteImportStoppedPayload
    if (!p.source_name || !p.domain || !p.stopped_on) {
      throw new Error('site_import_stopped: payload is missing a required field')
    }
    const copy = STOPPED_COPY[p.code]
    if (!copy) throw new Error(`site_import_stopped: unrecognised code ${p.code}`)
    const { title, body } = copy(p, siteImportDate(p.stopped_on))
    return { title, body, linkLabel: IMPORT_LINK_LABEL }
  },
}
