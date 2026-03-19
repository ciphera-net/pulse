import React from 'react'
import {
  Globe,
  WindowsLogo,
  AppleLogo,
  LinuxLogo,
  AndroidLogo,
  Question,
  DeviceMobile,
  DeviceTablet,
  Desktop,
  GoogleLogo,
  FacebookLogo,
  XLogo,
  LinkedinLogo,
  InstagramLogo,
  GithubLogo,
  YoutubeLogo,
  RedditLogo,
  Robot,
  Link,
  WhatsappLogo,
  TelegramLogo,
  SnapchatLogo,
  PinterestLogo,
  ThreadsLogo,
} from '@phosphor-icons/react'

/**
 * Google's public favicon service base URL.
 * Append `?domain=<host>&sz=<px>` to get a favicon.
 */
export const FAVICON_SERVICE_URL = 'https://www.google.com/s2/favicons'

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

export function getOSIcon(osName: string) {
  if (!osName) return <Question className="text-neutral-400" />
  const lower = osName.toLowerCase()
  if (lower.includes('win')) return <WindowsLogo className="text-blue-500" />
  if (lower.includes('mac') || lower.includes('ios')) return <AppleLogo className="text-neutral-800 dark:text-neutral-200" />
  if (lower.includes('linux') || lower.includes('ubuntu') || lower.includes('debian')) return <LinuxLogo className="text-neutral-800 dark:text-neutral-200" />
  if (lower.includes('android')) return <AndroidLogo className="text-green-500" />

  return <Question className="text-neutral-400" />
}

export function getDeviceIcon(deviceName: string) {
  if (!deviceName) return <Question className="text-neutral-400" />
  const lower = deviceName.toLowerCase()
  if (lower.includes('mobile') || lower.includes('phone')) return <DeviceMobile className="text-neutral-500" />
  if (lower.includes('tablet') || lower.includes('ipad')) return <DeviceTablet className="text-neutral-500" />
  if (lower.includes('desktop') || lower.includes('laptop')) return <Desktop className="text-neutral-500" />

  return <Question className="text-neutral-400" />
}

export function getReferrerIcon(referrerName: string) {
  if (!referrerName) return <Globe className="text-neutral-400" />
  const lower = referrerName.toLowerCase()
  if (lower.includes('google')) return <GoogleLogo className="text-blue-500" />
  if (lower.includes('facebook')) return <FacebookLogo className="text-blue-600" />
  if (lower.includes('twitter') || lower.includes('t.co') || lower.includes('x.com')) return <XLogo className="text-neutral-800 dark:text-neutral-200" />
  if (lower.includes('linkedin')) return <LinkedinLogo className="text-blue-700" />
  if (lower.includes('instagram')) return <InstagramLogo className="text-pink-600" />
  if (lower.includes('github')) return <GithubLogo className="text-neutral-800 dark:text-neutral-200" />
  if (lower.includes('youtube')) return <YoutubeLogo className="text-red-600" />
  if (lower.includes('reddit')) return <RedditLogo className="text-orange-600" />
  if (lower.includes('whatsapp')) return <WhatsappLogo className="text-green-500" />
  if (lower.includes('telegram')) return <TelegramLogo className="text-blue-500" />
  if (lower.includes('snapchat')) return <SnapchatLogo className="text-yellow-400" />
  if (lower.includes('pinterest')) return <PinterestLogo className="text-red-600" />
  if (lower.includes('threads')) return <ThreadsLogo className="text-neutral-800 dark:text-neutral-200" />
  // AI assistants and search tools
  if (lower.includes('chatgpt') || lower.includes('openai')) return <Robot className="text-neutral-800 dark:text-neutral-200" />
  if (lower.includes('perplexity')) return <Robot className="text-teal-600" />
  if (lower.includes('claude') || lower.includes('anthropic')) return <Robot className="text-orange-500" />
  if (lower.includes('gemini')) return <Robot className="text-blue-500" />
  if (lower.includes('copilot')) return <Robot className="text-blue-500" />
  if (lower.includes('deepseek')) return <Robot className="text-blue-600" />
  if (lower.includes('grok') || lower.includes('x.ai')) return <XLogo className="text-neutral-800 dark:text-neutral-200" />
  if (lower.includes('phind')) return <Robot className="text-purple-600" />
  if (lower.includes('you.com')) return <Robot className="text-indigo-600" />
  // Shared Link (unattributed deep-page traffic)
  if (lower === 'shared link') return <Link className="text-neutral-500" />

  return <Globe className="text-neutral-400" />
}

const REFERRER_NO_FAVICON = ['direct', 'shared link', 'unknown', '']

/** Common subdomains to skip when deriving the main label (e.g. l.instagram.com → instagram). */
const REFERRER_SUBDOMAIN_SKIP = new Set([
  'www', 'm', 'l', 'app', 'mobile', 'search', 'mail', 'drive', 'maps', 'docs',
  'sub', 'api', 'static', 'cdn', 'blog', 'shop', 'support', 'help', 'link',
])

/**
 * Override map for display names when the heuristic would be wrong (casing or brand alias).
 * Keys: lowercase label or hostname. Values: exact display name.
 */
const REFERRER_DISPLAY_OVERRIDES: Record<string, string> = {
  chatgpt: 'ChatGPT',
  linkedin: 'LinkedIn',
  youtube: 'YouTube',
  reddit: 'Reddit',
  github: 'GitHub',
  duckduckgo: 'DuckDuckGo',
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  pinterest: 'Pinterest',
  snapchat: 'Snapchat',
  threads: 'Threads',
  tumblr: 'Tumblr',
  quora: 'Quora',
  't.co': 'X',
  'x.com': 'X',
  // AI assistants and search tools
  openai: 'ChatGPT',
  perplexity: 'Perplexity',
  claude: 'Claude',
  anthropic: 'Claude',
  gemini: 'Gemini',
  copilot: 'Copilot',
  deepseek: 'DeepSeek',
  grok: 'Grok',
  'you': 'You.com',
  phind: 'Phind',
}

/**
 * Returns the hostname for a referrer string (URL or plain hostname), or null if invalid.
 */
function getReferrerHostname(referrer: string): string | null {
  if (!referrer || typeof referrer !== 'string') return null
  const trimmed = referrer.trim()
  if (REFERRER_NO_FAVICON.includes(trimmed.toLowerCase())) return null
  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`)
    return url.hostname.toLowerCase()
  } catch {
    return null
  }
}

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

function capitalizeLabel(label: string): string {
  if (!label) return label
  return label.charAt(0).toUpperCase() + label.slice(1).toLowerCase()
}

/**
 * Returns a friendly display name for the referrer (e.g. "Google" instead of "google.com").
 * Uses a heuristic (hostname → main label → capitalize) plus a small override map for famous brands.
 */
export function getReferrerDisplayName(referrer: string): string {
  if (!referrer || typeof referrer !== 'string') return referrer || ''
  const trimmed = referrer.trim()
  if (trimmed === '') return ''
  const hostname = getReferrerHostname(trimmed)
  if (!hostname) return trimmed
  const overrideByHostname = REFERRER_DISPLAY_OVERRIDES[hostname]
  if (overrideByHostname) return overrideByHostname
  const label = getReferrerLabel(hostname)
  const overrideByLabel = REFERRER_DISPLAY_OVERRIDES[label]
  if (overrideByLabel) return overrideByLabel
  return capitalizeLabel(label)
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

/** Domains that always use the custom X icon instead of favicon (avoids legacy bird). */
const REFERRER_USE_X_ICON = new Set(['t.co', 'x.com', 'twitter.com', 'www.twitter.com'])

/**
 * Returns a favicon URL for the referrer's domain, or null for non-URL referrers
 * (e.g. "Direct", "Unknown") so callers can show an icon fallback instead.
 */
export function getReferrerFavicon(referrer: string): string | null {
  if (!referrer || typeof referrer !== 'string') return null
  const normalized = referrer.trim().toLowerCase()
  if (REFERRER_NO_FAVICON.includes(normalized)) return null
  // Plain names without a dot (e.g. "Instagram", "WhatsApp") are not real domains
  if (!normalized.includes('.')) return null
  try {
    const url = new URL(referrer.startsWith('http') ? referrer : `https://${referrer}`)
    if (REFERRER_USE_X_ICON.has(url.hostname.toLowerCase())) return null
    return `${FAVICON_SERVICE_URL}?domain=${url.hostname}&sz=32`
  } catch {
    return null
  }
}
