import type { BotFilterRuleCount, BotFilterSummary, BotFilterWindow } from '@/lib/api/quarantine'

/**
 * What Settings → General says about each row of the bot filter's counts (Cerberus v2): its name and what it
 * checked, in the options round's words (26-11-2026). docs.ciphera.net/pulse/bot-filtering says the same at length,
 * and Analyst's get_excluded_traffic names the rows from that page.
 *
 * A row's key is the bot filter's own rule name, a published contract (pulse-backend internal/botfilter/rule.go),
 * plus `manual` (visits Ciphera held by hand) and `earlier` (the filter Pulse used before). A key the dashboard does
 * not know yet is a newer server's rule: it is drawn as "Other checks", so the rows still add up to the totals.
 */
export const BOT_FILTER_ROWS: Record<string, { label: string; caption: string }> = {
  known_bot: { label: 'Known bot', caption: 'Its browser is on a public list of crawlers, or its referrer is a spam domain.' },
  automation: { label: 'Automation', caption: 'Its browser said it was automated.' },
  datacenter: {
    label: 'Hosting network',
    caption: 'It came from a cloud or hosting network. Visitors on iCloud Private Relay, Tor or a known VPN service still count.',
  },
  impossible_device: { label: 'Impossible device', caption: 'It reported something no real browser does.' },
  repeated_fingerprint: {
    label: 'Repeated fingerprint',
    caption: 'On one day, 20 or more visits had exactly the same browser setup, and almost none of them did anything.',
  },
  no_sign_of_life: { label: 'No sign of life', caption: 'A computer opened one page and did nothing on it.' },
  clock_mismatch: { label: 'Clock mismatch', caption: "Its clock did not match the visitor's country." },
  no_input_navigation: { label: 'No input', caption: 'A computer reached a second page without a click, a key or a touch.' },
  manual: { label: 'Checked by hand', caption: 'Ciphera checked these visits by hand and left them out.' },
  earlier: { label: 'Earlier checks', caption: 'The filter left these out before it used the rules above.' },
}

/** The label for a row key the dashboard does not know (a newer server's rule). */
export const OTHER_CHECKS = 'Other checks'

/** A count as the page prints it: "1,436". */
export const count = (n: number) => Math.round(n).toLocaleString('en-GB')

/** "1 page view", "259 page views". */
export function pageViews(n: number): string {
  return `${count(n)} page ${n === 1 ? 'view' : 'views'}`
}

/** "1 visit", "118 visits". */
export function visits(n: number): string {
  return `${count(n)} ${n === 1 ? 'visit' : 'visits'}`
}

/**
 * A row's counts as one line: "107 page views", "85 page views, 3 visits", "79 visits". A count of zero or null
 * (the rule never judges at that moment) is left out; a row with nothing to say is not drawn (rowsToShow).
 */
export function countText(r: BotFilterRuleCount): string {
  const parts: string[] = []
  if (r.page_views) parts.push(pageViews(r.page_views))
  if (r.visits) parts.push(visits(r.visits))
  return parts.join(', ')
}

/** The rows worth drawing for a window, in the server's order (the rules, then manual, then earlier). */
export function rowsToShow(w: BotFilterWindow | undefined): { key: string; label: string; caption?: string; count: string }[] {
  if (!w?.rules) return []
  return w.rules
    .filter((r) => (r.page_views ?? 0) > 0 || (r.visits ?? 0) > 0)
    .map((r) => {
      const words = BOT_FILTER_ROWS[r.rule]
      return { key: r.rule, label: words?.label ?? OTHER_CHECKS, caption: words?.caption, count: countText(r) }
    })
}

/** One of the three windows the server answers, or undefined while loading or if it is missing. */
export function windowOf(s: BotFilterSummary | undefined, key: BotFilterWindow['window']): BotFilterWindow | undefined {
  return s?.windows.find((w) => w.window === key)
}
