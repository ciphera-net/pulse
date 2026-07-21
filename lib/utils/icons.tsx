import { type ReactNode } from 'react'
import { cdnUrl } from '@/lib/cdn'
import {
  Globe,
  Question,
  DeviceMobile,
  DeviceTablet,
  Desktop,
  Link,
  CursorClick,
  MapPin,
  Buildings,
  Broadcast,
  FileText,
  Tag,
  FrameCorners,
} from '@phosphor-icons/react'
import { CountryFlag } from '@/components/ui/CountryFlag'
import { hasFlag } from '@/lib/flags'
const ICON_SIZE = 20

function brandIcon(slug: string, alt: string) {
  return <img src={cdnUrl(`/icons/brands/${slug}.svg`)} alt={alt} width={ICON_SIZE} height={ICON_SIZE} className="inline-block" />
}

import { FAVICON_SERVICE_URL } from './favicon'
export { FAVICON_SERVICE_URL }

// ─── Browser, OS, Device icons (unchanged) ───────────────────────────────────

const BROWSER_ICON_MAP: Record<string, { file: string; ext: 'svg' | 'png' }> = {
  'chrome':           { file: 'chrome',           ext: 'svg' },
  'firefox':          { file: 'firefox',          ext: 'svg' },
  'safari':           { file: 'safari',           ext: 'svg' },
  'edge':             { file: 'edge',             ext: 'svg' },
  'opera':            { file: 'opera',            ext: 'svg' },
  'brave':            { file: 'brave',            ext: 'svg' },
  'vivaldi':          { file: 'vivaldi',          ext: 'svg' },
  'samsung internet': { file: 'samsung-internet', ext: 'svg' },
  'uc browser':       { file: 'uc-browser',       ext: 'svg' },
  'yandex browser':   { file: 'yandex',           ext: 'png' },
  'waterfox':         { file: 'waterfox',         ext: 'png' },
  'pale moon':        { file: 'pale-moon',        ext: 'png' },
  'duckduckgo':       { file: 'duckduckgo',       ext: 'png' },
  'maxthon':          { file: 'maxthon',          ext: 'png' },
  'silk':             { file: 'silk',             ext: 'png' },
  'puffin':           { file: 'puffin',           ext: 'png' },
  'arc':              { file: 'arc',              ext: 'png' },
  'tor':              { file: 'tor',              ext: 'png' },
  'opera mini':       { file: 'opera-mini',       ext: 'png' },
}

const BROWSER_COMPONENT_MAP: Record<string, () => ReactNode> = {
  'facebook browser':  () => brandIcon('facebook', 'Facebook'),
  'instagram browser': () => brandIcon('instagram', 'Instagram'),
  'threads browser':   () => brandIcon('threads', 'Threads'),
  'tiktok browser':    () => brandIcon('tiktok', 'TikTok'),
  'snapchat browser':  () => brandIcon('snapchat', 'Snapchat'),
  'twitter browser':   () => brandIcon('x', 'X'),
  'linkedin browser':  () => brandIcon('linkedin', 'LinkedIn'),
  'pinterest browser': () => brandIcon('pinterest', 'Pinterest'),
  'wechat browser':    () => brandIcon('wechat', 'WeChat'),
  'line browser':      () => brandIcon('line', 'LINE'),
}

export function getBrowserIcon(browserName: string) {
  if (!browserName) return <Globe className="text-neutral-400" />
  const lower = browserName.toLowerCase()
  const component = BROWSER_COMPONENT_MAP[lower]
  if (component) return component()
  const entry = BROWSER_ICON_MAP[lower]
  if (!entry) return <Globe className="text-neutral-500" />
  const src = cdnUrl(`/icons/browsers/${entry.file}.${entry.ext}`)
  return <img src={src} alt={browserName} width={ICON_SIZE} height={ICON_SIZE} className="inline-block" style={{ verticalAlign: '-0.125em' }} />
}

const OS_DARK_INVERT = new Set(['macos', 'playstation'])

const OS_ICON_MAP: Record<string, string> = {
  'windows':     'windows',
  'macos':       'macos',
  'linux':       'linux',
  'android':     'android',
  'ios':         'ios',
  'chromeos':    'chromeos',
  'harmonyos':   'harmonyos',
  'kaios':       'kaios',
  'tizen':       'tizen',
  'webos':       'webos',
  'freebsd':     'freebsd',
  'openbsd':     'openbsd',
  'netbsd':      'netbsd',
  'playstation': 'playstation',
  'xbox':        'xbox',
  'nintendo':    'nintendo',
}

export function getOSIcon(osName: string) {
  if (!osName) return <Question className="text-neutral-400" />
  const file = OS_ICON_MAP[osName.toLowerCase()]
  if (!file) return <Question className="text-neutral-400" />
  const cls = OS_DARK_INVERT.has(file) ? 'inline-block invert' : 'inline-block'
  return <img src={cdnUrl(`/icons/os/${file}.png`)} alt={osName} width={ICON_SIZE} height={ICON_SIZE} className={cls} style={{ verticalAlign: '-0.125em' }} />
}

export function getDeviceIcon(deviceName: string) {
  if (!deviceName) return <Question className="text-neutral-400" />
  const lower = deviceName.toLowerCase()
  if (lower.includes('mobile') || lower.includes('phone')) return <DeviceMobile className="text-neutral-500" />
  if (lower.includes('tablet') || lower.includes('ipad')) return <DeviceTablet className="text-neutral-500" />
  if (lower.includes('desktop') || lower.includes('laptop')) return <Desktop className="text-neutral-500" />

  return <Question className="text-neutral-400" />
}

// ─── Referrer Registry ───────────────────────────────────────────────────────

interface ReferrerEntry {
  display: string
  icon: () => ReactNode
  hostnames?: string[]
  aliases?: string[]
}

/**
 * Single source of truth for all known referrer brands.
 * Key = canonical label (what getReferrerLabel extracts from hostnames).
 * Adding a new brand = adding one entry here. Nothing else.
 */
const REFERRER_REGISTRY: Record<string, ReferrerEntry> = {
  // ── Special ──
  direct:      { display: 'Direct',      icon: () => <CursorClick className="w-5 h-5 text-neutral-500" /> },
  'shared link': { display: 'Shared Link', icon: () => <Link className="w-5 h-5 text-neutral-500" /> },

  // ── Social / platforms ──
  google:      { display: 'Google',      icon: () => brandIcon('google', 'Google') },
  facebook:    { display: 'Facebook',    icon: () => brandIcon('facebook', 'Facebook'),    aliases: ['fb'] },
  x:           { display: 'X',           icon: () => brandIcon('x', 'X'),                  hostnames: ['t.co', 'x.com', 'twitter.com'] },
  linkedin:    { display: 'LinkedIn',    icon: () => brandIcon('linkedin', 'LinkedIn') },
  instagram:   { display: 'Instagram',   icon: () => brandIcon('instagram', 'Instagram'),  aliases: ['ig'] },
  github:      { display: 'GitHub',      icon: () => brandIcon('github', 'GitHub') },
  youtube:     { display: 'YouTube',     icon: () => brandIcon('youtube', 'YouTube'),      aliases: ['yt'] },
  reddit:      { display: 'Reddit',      icon: () => brandIcon('reddit', 'Reddit') },
  whatsapp:    { display: 'WhatsApp',    icon: () => brandIcon('whatsapp', 'WhatsApp'),    hostnames: ['l.wl.co', 'wa.me'] },
  telegram:    { display: 'Telegram',    icon: () => brandIcon('telegram', 'Telegram'),    hostnames: ['t.me'] },
  snapchat:    { display: 'Snapchat',    icon: () => brandIcon('snapchat', 'Snapchat') },
  pinterest:   { display: 'Pinterest',   icon: () => brandIcon('pinterest', 'Pinterest') },
  threads:     { display: 'Threads',     icon: () => brandIcon('threads', 'Threads') },
  discord:     { display: 'Discord',     icon: () => brandIcon('discord', 'Discord') },
  tumblr:      { display: 'Tumblr',      icon: () => <Globe className="w-5 h-5 text-neutral-400" /> },
  quora:       { display: 'Quora',       icon: () => <Globe className="w-5 h-5 text-neutral-400" /> },

  // ── Search engines ──
  bing:        { display: 'Bing',        icon: () => brandIcon('bing', 'Bing') },
  duckduckgo:  { display: 'DuckDuckGo',  icon: () => brandIcon('duckduckgo', 'DuckDuckGo') },
  brave:       { display: 'Brave',       icon: () => brandIcon('brave', 'Brave') },

  // ── AI assistants ──
  chatgpt:     { display: 'ChatGPT',     icon: () => brandIcon('openai', 'ChatGPT'),                  hostnames: ['chat.openai.com', 'openai.com'] },
  perplexity:  { display: 'Perplexity',  icon: () => brandIcon('perplexity', 'Perplexity') },
  claude:      { display: 'Claude',      icon: () => brandIcon('anthropic', 'Claude'),                 hostnames: ['anthropic.com'] },
  gemini:      { display: 'Gemini',      icon: () => brandIcon('googlegemini', 'Gemini'),              hostnames: ['gemini.google.com'] },
  copilot:     { display: 'Copilot',     icon: () => brandIcon('githubcopilot', 'Copilot'),            hostnames: ['copilot.microsoft.com'] },
  deepseek:    { display: 'DeepSeek',    icon: () => brandIcon('deepseek', 'DeepSeek'),                hostnames: ['chat.deepseek.com'] },
  grok:        { display: 'Grok',        icon: () => brandIcon('x', 'Grok'),                           hostnames: ['grok.x.ai', 'x.ai'] },
  you:         { display: 'You.com',     icon: () => <Globe className="w-5 h-5 text-neutral-400" /> },
  phind:       { display: 'Phind',       icon: () => <Globe className="w-5 h-5 text-neutral-400" /> },

  // ── Browsers as referrers ──
  googlechrome: { display: 'Google Chrome', icon: () => <img src={cdnUrl('/icons/browsers/chrome.svg')} alt="Chrome" width={ICON_SIZE} height={ICON_SIZE} className="inline-block" />, hostnames: ['googlechrome.github.io'] },

  // ── Ciphera products ──
  pulse:       { display: 'Pulse',        icon: () => <img src={cdnUrl('/pulse_icon_no_margins.png')} alt="Pulse" width={ICON_SIZE} height={ICON_SIZE} className="inline-block" />, hostnames: ['pulse.ciphera.net', 'pulse-staging.ciphera.net'] },
}

// ── Derived lookup maps (built once at module load) ──

/** alias → registry key (e.g. "ig" → "instagram", "fb" → "facebook") */
const ALIAS_TO_KEY: Record<string, string> = {}

/** exact hostname → registry key (e.g. "t.co" → "x", "t.me" → "telegram") */
const HOSTNAME_TO_KEY: Record<string, string> = {}

/** All known hostnames — union of auto-derived (key + ".com") and explicit hostnames */
const ALL_KNOWN_HOSTNAMES = new Set<string>()

for (const [key, entry] of Object.entries(REFERRER_REGISTRY)) {
  if (entry.aliases) {
    for (const alias of entry.aliases) {
      ALIAS_TO_KEY[alias] = key
    }
  }
  if (entry.hostnames) {
    for (const hostname of entry.hostnames) {
      HOSTNAME_TO_KEY[hostname] = key
      ALL_KNOWN_HOSTNAMES.add(hostname)
    }
  }
  // Auto-derive common hostnames from the key itself
  ALL_KNOWN_HOSTNAMES.add(`${key}.com`)
  ALL_KNOWN_HOSTNAMES.add(`www.${key}.com`)
}

// ── Referrer resolution ──

/** Common subdomains to skip when deriving the main label (e.g. l.instagram.com → instagram). */
const REFERRER_SUBDOMAIN_SKIP = new Set([
  'www', 'm', 'l', 'app', 'mobile', 'search', 'mail', 'drive', 'maps', 'docs',
  'sub', 'api', 'static', 'cdn', 'blog', 'shop', 'support', 'help', 'link',
])

const REFERRER_NO_FAVICON = new Set(['direct', 'shared link', 'unknown', ''])

/**
 * Derives the main label from a hostname (e.g. "l.instagram.com" → "instagram", "google.com" → "google").
 */
function getReferrerLabel(hostname: string): string {
  const withoutWww = hostname.startsWith('www.') ? hostname.slice(4) : hostname
  const parts = withoutWww.split('.')
  if (parts.length >= 2 && REFERRER_SUBDOMAIN_SKIP.has(parts[0])) {
    return parts[1]
  }
  return parts[0] ?? withoutWww
}

function getReferrerHostname(referrer: string): string | null {
  if (!referrer || typeof referrer !== 'string') return null
  const trimmed = referrer.trim()
  if (REFERRER_NO_FAVICON.has(trimmed.toLowerCase())) return null
  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`)
    return url.hostname.toLowerCase()
  } catch {
    return null
  }
}

/**
 * Resolves a raw referrer string to a registry entry.
 * Returns null if no known brand matches (unknown domain → use favicon service).
 */
function resolveReferrer(referrer: string): ReferrerEntry | null {
  if (!referrer || typeof referrer !== 'string') return null
  const lower = referrer.trim().toLowerCase()

  // 1. Exact registry key match (e.g. "Direct", "Reddit", "Google")
  if (REFERRER_REGISTRY[lower]) return REFERRER_REGISTRY[lower]

  // 2. Alias match (e.g. "ig" → instagram, "fb" → facebook)
  const aliasKey = ALIAS_TO_KEY[lower]
  if (aliasKey) return REFERRER_REGISTRY[aliasKey]

  // 3. Hostname-based matching
  const hostname = getReferrerHostname(referrer)
  if (!hostname) return null

  // 3a. Exact hostname match (e.g. "t.co" → x, "t.me" → telegram)
  const hostnameKey = HOSTNAME_TO_KEY[hostname]
  if (hostnameKey) return REFERRER_REGISTRY[hostnameKey]

  // 3b. Label-based lookup (e.g. "old.reddit.com" → label "reddit" → registry hit)
  const label = getReferrerLabel(hostname)
  if (REFERRER_REGISTRY[label]) return REFERRER_REGISTRY[label]

  // 3c. Check alias from label (e.g. hostname "ig.something.com" → label "ig" → alias → instagram)
  const labelAliasKey = ALIAS_TO_KEY[label]
  if (labelAliasKey) return REFERRER_REGISTRY[labelAliasKey]

  return null
}

// ── Public API (same signatures as before) ──

export function getReferrerIcon(referrerName: string): ReactNode {
  if (!referrerName) return <Globe className="w-5 h-5 text-neutral-400" />
  const entry = resolveReferrer(referrerName)
  if (entry) return entry.icon()
  return <Globe className="w-5 h-5 text-neutral-400" />
}

function capitalizeLabel(label: string): string {
  if (!label) return label
  return label.charAt(0).toUpperCase() + label.slice(1).toLowerCase()
}

export function getReferrerDisplayName(referrer: string): string {
  if (!referrer || typeof referrer !== 'string') return referrer || ''
  const trimmed = referrer.trim()
  if (trimmed === '') return ''
  const entry = resolveReferrer(trimmed)
  if (entry) return entry.display
  // Unknown referrer — derive display name from hostname
  const hostname = getReferrerHostname(trimmed)
  if (!hostname) return trimmed
  return capitalizeLabel(getReferrerLabel(hostname))
}

export function getReferrerFavicon(referrer: string): string | null {
  if (!referrer || typeof referrer !== 'string') return null
  const normalized = referrer.trim().toLowerCase()
  if (REFERRER_NO_FAVICON.has(normalized)) return null
  if (!normalized.includes('.')) return null
  // Known brand → skip favicon service, use registry icon
  if (resolveReferrer(referrer)) return null
  try {
    const url = new URL(referrer.startsWith('http') ? referrer : `https://${referrer}`)
    return `${FAVICON_SERVICE_URL}?domain=${url.hostname.toLowerCase()}&sz=32`
  } catch {
    return null
  }
}

// ─── Filter value icons ───────────────────────────────────────────────────────

/** Country flag for an ISO code; special aggregate codes fall back to a globe. */
export function getCountryFlagIcon(code: string): ReactNode {
  if (!code || code === 'Unknown' || !hasFlag(code)) return <Globe className="text-neutral-400" />
  return <CountryFlag code={code} className="h-4 w-4 rounded-none" />
}

/**
 * Icon for a filter-suggestion value, matching the dashboard panels'
 * iconography (flags in Locations, brand icons in TechSpecs, favicons in
 * Referrers) so the filter popover reads as the same product.
 */
export function getFilterValueIcon(dimension: string, value: string): ReactNode {
  switch (dimension) {
    case 'country':
      return getCountryFlagIcon(value)
    case 'browser':
      return getBrowserIcon(value)
    case 'os':
      return getOSIcon(value)
    case 'device':
      return getDeviceIcon(value)
    case 'referrer': {
      const favicon = getReferrerFavicon(value)
      if (favicon) return <img src={favicon} alt="" loading="lazy" />
      return getReferrerIcon(value)
    }
    case 'channel':
      return <Broadcast className="text-neutral-500" />
    case 'page':
      return <FileText className="text-neutral-500" />
    case 'region':
      return <MapPin className="text-neutral-500" />
    case 'city':
      return <Buildings className="text-neutral-500" />
    case 'screen_resolution':
      return <FrameCorners className="text-neutral-500" />
    case 'event_name':
      return <CursorClick className="text-neutral-500" />
    case 'utm_source':
    case 'utm_medium':
    case 'utm_campaign':
    case 'utm_term':
    case 'utm_content':
      return <Tag className="text-neutral-500" />
    default:
      return <Globe className="text-neutral-500" />
  }
}

/**
 * Merges referrer rows that share the same display name (e.g. chatgpt.com and https://chatgpt.com/...),
 * summing pageviews and keeping one referrer per group for icon/tooltip. Sorted by pageviews desc.
 */
export function mergeReferrersByDisplayName(
  items: Array<{ referrer: string; pageviews: number }>
): Array<{ referrer: string; pageviews: number; allReferrers: string[] }> {
  const byDisplayName = new Map<string, { referrer: string; pageviews: number; maxSingle: number; allReferrers: Set<string> }>()
  for (const ref of items) {
    const name = getReferrerDisplayName(ref.referrer)
    const existing = byDisplayName.get(name)
    if (!existing) {
      byDisplayName.set(name, { referrer: ref.referrer, pageviews: ref.pageviews, maxSingle: ref.pageviews, allReferrers: new Set([ref.referrer]) })
    } else {
      existing.pageviews += ref.pageviews
      existing.allReferrers.add(ref.referrer)
      if (ref.pageviews > existing.maxSingle) {
        existing.maxSingle = ref.pageviews
        existing.referrer = ref.referrer
      }
    }
  }
  return Array.from(byDisplayName.values())
    .map(({ referrer, pageviews, allReferrers }) => ({ referrer, pageviews, allReferrers: Array.from(allReferrers) }))
    .sort((a, b) => b.pageviews - a.pageviews)
}
