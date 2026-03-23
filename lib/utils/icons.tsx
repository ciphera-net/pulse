import React, { type ReactNode } from 'react'
import {
  Globe,
  Question,
  DeviceMobile,
  DeviceTablet,
  Desktop,
  Link,
  CursorClick,
} from '@phosphor-icons/react'
import {
  SiGoogle,
  SiFacebook,
  SiInstagram,
  SiGithub,
  SiYoutube,
  SiReddit,
  SiWhatsapp,
  SiTelegram,
  SiSnapchat,
  SiPinterest,
  SiThreads,
  SiDuckduckgo,
  SiBrave,
  SiPerplexity,
  SiAnthropic,
  SiGooglegemini,
  SiGithubcopilot,
  SiDiscord,
} from '@icons-pack/react-simple-icons'

// Inline SVG icons for brands not in @icons-pack/react-simple-icons
function XIcon({ size = 16, color = '#fff' }: { size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z"/></svg>
}
function LinkedInIcon({ size = 16, color = '#0A66C2' }: { size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
}
function OpenAIIcon({ size = 16, color = '#fff' }: { size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/></svg>
}
function BingIcon({ size = 16, color = '#258FFA' }: { size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M5.71 0v18.39l4.44 2.46 8.14-4.69v-4.71l-8.14-2.84V4.09L5.71 0zm4.44 11.19l4.39 1.53v2.78l-4.39 2.53v-6.84z"/></svg>
}

/**
 * Google's public favicon service base URL.
 * Append `?domain=<host>&sz=<px>` to get a favicon.
 */
export const FAVICON_SERVICE_URL = 'https://www.google.com/s2/favicons'

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

export function getBrowserIcon(browserName: string) {
  if (!browserName) return <Globe className="text-neutral-400" />
  const entry = BROWSER_ICON_MAP[browserName.toLowerCase()]
  if (!entry) return <Globe className="text-neutral-500" />
  const src = `/icons/browsers/${entry.file}.${entry.ext}`
  return <img src={src} alt={browserName} width={18} height={18} className="inline-block" style={{ verticalAlign: '-0.125em' }} />
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
  const cls = OS_DARK_INVERT.has(file) ? 'inline-block dark:invert' : 'inline-block'
  return <img src={`/icons/os/${file}.png`} alt={osName} width={18} height={18} className={cls} style={{ verticalAlign: '-0.125em' }} />
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

const SI = { size: 16 } as const

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
  direct:      { display: 'Direct',      icon: () => <CursorClick className="text-neutral-500" /> },
  'shared link': { display: 'Shared Link', icon: () => <Link className="text-neutral-500" /> },

  // ── Social / platforms ──
  google:      { display: 'Google',      icon: () => <SiGoogle size={SI.size} color="#4285F4" /> },
  facebook:    { display: 'Facebook',    icon: () => <SiFacebook size={SI.size} color="#0866FF" />,    aliases: ['fb'] },
  x:           { display: 'X',           icon: () => <XIcon />,                                       hostnames: ['t.co', 'x.com', 'twitter.com'] },
  linkedin:    { display: 'LinkedIn',    icon: () => <LinkedInIcon /> },
  instagram:   { display: 'Instagram',   icon: () => <SiInstagram size={SI.size} color="#E4405F" />,   aliases: ['ig'] },
  github:      { display: 'GitHub',      icon: () => <SiGithub size={SI.size} color="#fff" /> },
  youtube:     { display: 'YouTube',     icon: () => <SiYoutube size={SI.size} color="#FF0000" />,     aliases: ['yt'] },
  reddit:      { display: 'Reddit',      icon: () => <SiReddit size={SI.size} color="#FF4500" /> },
  whatsapp:    { display: 'WhatsApp',    icon: () => <SiWhatsapp size={SI.size} color="#25D366" /> },
  telegram:    { display: 'Telegram',    icon: () => <SiTelegram size={SI.size} color="#26A5E4" />,    hostnames: ['t.me'] },
  snapchat:    { display: 'Snapchat',    icon: () => <SiSnapchat size={SI.size} color="#FFFC00" /> },
  pinterest:   { display: 'Pinterest',   icon: () => <SiPinterest size={SI.size} color="#BD081C" /> },
  threads:     { display: 'Threads',     icon: () => <SiThreads size={SI.size} color="#fff" /> },
  discord:     { display: 'Discord',     icon: () => <SiDiscord size={SI.size} color="#5865F2" /> },
  tumblr:      { display: 'Tumblr',      icon: () => <Globe className="text-neutral-400" /> },
  quora:       { display: 'Quora',       icon: () => <Globe className="text-neutral-400" /> },

  // ── Search engines ──
  bing:        { display: 'Bing',        icon: () => <BingIcon /> },
  duckduckgo:  { display: 'DuckDuckGo',  icon: () => <SiDuckduckgo size={SI.size} color="#DE5833" /> },
  brave:       { display: 'Brave',       icon: () => <SiBrave size={SI.size} color="#FB542B" /> },

  // ── AI assistants ──
  chatgpt:     { display: 'ChatGPT',     icon: () => <OpenAIIcon />,                                  hostnames: ['chat.openai.com', 'openai.com'] },
  perplexity:  { display: 'Perplexity',  icon: () => <SiPerplexity size={SI.size} color="#1FB8CD" /> },
  claude:      { display: 'Claude',      icon: () => <SiAnthropic size={SI.size} color="#D97757" />,   hostnames: ['anthropic.com'] },
  gemini:      { display: 'Gemini',      icon: () => <SiGooglegemini size={SI.size} color="#8E75B2" />, hostnames: ['gemini.google.com'] },
  copilot:     { display: 'Copilot',     icon: () => <SiGithubcopilot size={SI.size} color="#fff" />,  hostnames: ['copilot.microsoft.com'] },
  deepseek:    { display: 'DeepSeek',    icon: () => <OpenAIIcon color="#4D6BFE" />,                   hostnames: ['chat.deepseek.com'] },
  grok:        { display: 'Grok',        icon: () => <XIcon />,                                       hostnames: ['grok.x.ai', 'x.ai'] },
  you:         { display: 'You.com',     icon: () => <Globe className="text-neutral-400" /> },
  phind:       { display: 'Phind',       icon: () => <Globe className="text-neutral-400" /> },

  // ── Browsers as referrers ──
  googlechrome: { display: 'Google Chrome', icon: () => <img src="/icons/browsers/chrome.svg" alt="Chrome" width={16} height={16} className="inline-block" />, hostnames: ['googlechrome.github.io'] },
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
  if (!referrerName) return <Globe className="text-neutral-400" />
  const entry = resolveReferrer(referrerName)
  if (entry) return entry.icon()
  return <Globe className="text-neutral-400" />
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

/**
 * Merges referrer rows that share the same display name (e.g. chatgpt.com and https://chatgpt.com/...),
 * summing pageviews and keeping one referrer per group for icon/tooltip. Sorted by pageviews desc.
 */
export function mergeReferrersByDisplayName(
  items: Array<{ referrer: string; pageviews: number }>
): Array<{ referrer: string; pageviews: number }> {
  const byDisplayName = new Map<string, { referrer: string; pageviews: number; maxSingle: number }>()
  for (const ref of items) {
    const name = getReferrerDisplayName(ref.referrer)
    const existing = byDisplayName.get(name)
    if (!existing) {
      byDisplayName.set(name, { referrer: ref.referrer, pageviews: ref.pageviews, maxSingle: ref.pageviews })
    } else {
      existing.pageviews += ref.pageviews
      if (ref.pageviews > existing.maxSingle) {
        existing.maxSingle = ref.pageviews
        existing.referrer = ref.referrer
      }
    }
  }
  return Array.from(byDisplayName.values())
    .map(({ referrer, pageviews }) => ({ referrer, pageviews }))
    .sort((a, b) => b.pageviews - a.pageviews)
}
