/**
 * Outbound links as rows, for the Pages block's Outbound tab (the new dashboard frame, 15-11-2026).
 *
 * The tracker records a click on a link to another hostname as an `outbound_link` event with the link's `url`.
 * The property read answers `{ value: <url>, count: <clicks> }`, most clicked first. A row here is one link, read
 * as a person would say it: the host without `www.`, then the path and the query (nothing after the host for a
 * bare `/`), with no scheme. A value that is not a URL is left out: it has nowhere to open.
 *
 * Pure, so the rows can be tested without a block around them.
 */
export interface OutboundLinkRow {
  /** The link as it was recorded: what the row opens, and its key. */
  href: string
  /** The host without `www.`, lower case. */
  host: string
  /** What the row reads: the host, then the path and query. */
  label: string
  clicks: number
}

export function outboundLinkRows(urls: ReadonlyArray<{ value: string; count: number }> | undefined | null): OutboundLinkRow[] {
  const rows: OutboundLinkRow[] = []
  for (const { value, count } of urls ?? []) {
    let url: URL
    try {
      url = new URL(value)
    } catch {
      continue
    }
    // A link opens a page: `javascript:` and its kin are not destinations and must never become an href.
    if (url.protocol !== 'https:' && url.protocol !== 'http:') continue
    const host = url.hostname.replace(/^www\./, '').toLowerCase()
    if (!host) continue
    const rest = url.pathname === '/' && !url.search ? '' : url.pathname + url.search
    rows.push({ href: value, host, label: host + rest, clicks: count })
  }
  return rows
}
