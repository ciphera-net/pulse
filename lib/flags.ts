// Country flags are served as individual SVGs from the CDN bucket ROOT
// (https://cdn.ciphera.net/flags/<alpha2>.svg) — deliberately OUTSIDE this app's
// NEXT_PUBLIC_CDN_URL prefix (…/pulse), so the set is shared across the fleet and
// any app can point at the same source. cdnUrl() must NOT be used for flags (it
// would prepend /pulse and 404).
//
// The artwork is the public-domain `country-flag-icons` 3x2 set, uploaded once via
// `scripts/cdn-upload.sh <dir> flags`. To add/refresh a flag, re-upload that file.

// ISO 3166-1 alpha-2 (plus a handful of subdivision codes) for which a flag SVG
// exists on the CDN. We check this before rendering so an unknown code — or a
// GeoIP aggregate pseudo-code with no flag art (e.g. T1/A1/A2/O1/AP) — falls back
// to a globe/placeholder instead of rendering a broken <img>. (EU *does* have flag
// art here; Locations separately overrides EU→globe as a continent aggregate.)
// Generated from the uploaded flag set.
const FLAG_CODES = new Set<string>(["AC","AD","AE","AF","AG","AI","AL","AM","AO","AQ","AR","AS","AT","AU","AW","AX","AZ","BA","BB","BD","BE","BF","BG","BH","BI","BJ","BL","BM","BN","BO","BQ","BQ-BO","BQ-SA","BQ-SE","BR","BS","BT","BV","BW","BY","BZ","CA","CC","CD","CF","CG","CH","CI","CK","CL","CM","CN","CO","CR","CU","CV","CW","CX","CY","CZ","DE","DJ","DK","DM","DO","DZ","EC","EE","EG","EH","ER","ES","ES-CT","ET","EU","FI","FJ","FK","FM","FO","FR","GA","GB","GB-ENG","GB-NIR","GB-SCT","GB-WLS","GD","GE","GF","GG","GH","GI","GL","GM","GN","GP","GQ","GR","GS","GT","GU","GW","GY","HK","HM","HN","HR","HT","HU","IC","ID","IE","IL","IM","IN","IO","IQ","IR","IS","IT","JE","JM","JO","JP","KE","KG","KH","KI","KM","KN","KP","KR","KW","KY","KZ","LA","LB","LC","LI","LK","LR","LS","LT","LU","LV","LY","MA","MC","MD","ME","MF","MG","MH","MK","ML","MM","MN","MO","MP","MQ","MR","MS","MT","MU","MV","MW","MX","MY","MZ","NA","NC","NE","NF","NG","NI","NL","NO","NP","NR","NU","NZ","OM","PA","PE","PF","PG","PH","PK","PL","PM","PN","PR","PS","PT","PW","PY","QA","RE","RO","RS","RU","RW","SA","SB","SC","SD","SE","SG","SH","SI","SJ","SK","SL","SM","SN","SO","SR","SS","ST","SV","SX","SY","SZ","TA","TC","TD","TF","TG","TH","TJ","TK","TL","TM","TN","TO","TR","TT","TV","TW","TZ","UA","UG","UM","US","UY","UZ","VA","VC","VE","VG","VI","VN","VU","WF","WS","XA","XC","XK","XO","YE","YT","ZA","ZM","ZW"])

/** True when a flag SVG exists on the CDN for this alpha-2 code (case-insensitive). */
export function hasFlag(alpha2?: string | null): boolean {
  return !!alpha2 && FLAG_CODES.has(alpha2.toUpperCase())
}

// Flags live at the CDN ORIGIN root, not the per-app prefix. Derive the origin from
// NEXT_PUBLIC_CDN_URL (e.g. https://cdn.ciphera.net/pulse -> https://cdn.ciphera.net);
// fall back to the known host so flags still load in local dev when the env is unset.
function cdnOrigin(): string {
  const base = process.env.NEXT_PUBLIC_CDN_URL
  if (!base) return 'https://cdn.ciphera.net'
  try {
    return new URL(base).origin
  } catch {
    return 'https://cdn.ciphera.net'
  }
}

/** CDN URL for a country flag SVG. Callers should gate on hasFlag(alpha2) first. */
export function flagUrl(alpha2: string): string {
  return `${cdnOrigin()}/flags/${alpha2.toLowerCase()}.svg`
}
