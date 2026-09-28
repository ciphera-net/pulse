// ─── Does a raw row belong to this site? (M9-j′, M8-b′) ────────────────────
//
// A raw export names the host each row was recorded on. Imported into the
// wrong Pulse site, another property's export would read as this site's
// history, so every `upload_raw` source whose rows carry a host holds them to
// the site's own domain through THIS module: one rule, never a second
// comparison written per source. Simple Analytics (`hostname`, M9-j′) and
// Umami (`hostname`, M8-b′) both use it.
//
// The rule: a row belongs when its host, normalised, equals the site's domain,
// normalised the same way. Normalising lower-cases, converts a Unicode host to
// its ASCII form, strips one leading `www.` and one trailing root-label dot.
// Nothing else: a subdomain (`blog.example.com` against `example.com`) is a
// DIFFERENT site, as it is to `ingestnorm.IsOwnHost`. An empty host equals no
// site's domain, so a row with no host is not this site's.
//
// When the server sent no domain (an older server, before `site_domain`), the
// check falls back to the file itself: the first row it is asked about sets
// the reference and every later row is held to it. That still catches a file
// that mixes two properties, though not a whole export of the wrong one.

/**
 * A Unicode hostname's ASCII (punycode) form, via the WHATWG URL parser
 * (M9-j′): the site's own configured domain already stores an IDN site's
 * ASCII form (id-backend #526/#531), so a raw export row naming the same site
 * in Unicode must be converted the same way before the two are compared. A
 * value the URL parser cannot make into a hostname at all (empty, or already
 * malformed for other reasons the row-level checks catch elsewhere) is
 * returned unchanged rather than thrown away here.
 */
function toAsciiHost(value: string): string {
  if (value === '') return value
  try {
    return new URL(`http://${value}/`).hostname
  } catch {
    return value
  }
}

/**
 * Lower-cased, `www.`-stripped, and Unicode converted to ASCII:
 * `ingestnorm.IsOwnHost`'s own convention (M9-j), extended for M9-j′ to also
 * match the site's own domain. A single trailing root-label dot (the
 * `example.com.` FQDN form) is stripped too: `sites.domain` never carries one
 * (backend), so a raw export row that does must not be the one thing left
 * un-normalised here.
 */
export function normaliseHost(value: string): string {
  const ascii = toAsciiHost(value.trim().toLowerCase())
  const noWww = ascii.startsWith('www.') ? ascii.slice(4) : ascii
  return noWww.endsWith('.') ? noWww.slice(0, -1) : noWww
}

/**
 * One file's host check: `belongs(host)` is true when a row's host is this
 * site's. Built once per file, from the parse context's `siteDomain`.
 */
export function siteHostCheck(siteDomain: string | null): (host: string) => boolean {
  if (siteDomain !== null) {
    const site = normaliseHost(siteDomain)
    return (host) => normaliseHost(host) === site
  }
  let reference: string | null = null
  return (host) => {
    const h = normaliseHost(host)
    if (reference === null) reference = h
    return h === reference
  }
}
