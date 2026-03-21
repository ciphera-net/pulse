import React from 'react'
import {
  Globe,
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
  MagnifyingGlass,
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
  // Search engines
  if (lower.includes('bing')) return <MagnifyingGlass className="text-blue-500" />
  if (lower.includes('duckduckgo')) return <MagnifyingGlass className="text-orange-500" />
  if (lower.includes('brave')) return <MagnifyingGlass className="text-orange-400" />
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
  bing: 'Bing',
  brave: 'Brave',
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

/**
 * Domains/labels where the Phosphor icon is better than Google's favicon service.
 * For these, getReferrerFavicon returns null so the caller falls back to getReferrerIcon.
 */
const REFERRER_PREFER_ICON = new Set([
  // Social / platforms
  't.co', 'x.com', 'twitter.com', 'www.twitter.com',
  'google.com', 'www.google.com',
  'facebook.com', 'www.facebook.com', 'm.facebook.com', 'l.facebook.com',
  'instagram.com', 'www.instagram.com', 'l.instagram.com',
  'linkedin.com', 'www.linkedin.com',
  'github.com', 'www.github.com',
  'youtube.com', 'www.youtube.com', 'm.youtube.com',
  'reddit.com', 'www.reddit.com', 'old.reddit.com',
  'whatsapp.com', 'www.whatsapp.com', 'web.whatsapp.com',
  'telegram.org', 'web.telegram.org', 't.me',
  'snapchat.com', 'www.snapchat.com',
  'pinterest.com', 'www.pinterest.com',
  'threads.net', 'www.threads.net',
  // Search engines
  'bing.com', 'www.bing.com',
  'duckduckgo.com', 'www.duckduckgo.com',
  'search.brave.com', 'brave.com',
  // AI assistants
  'chatgpt.com', 'chat.openai.com', 'openai.com',
  'perplexity.ai', 'www.perplexity.ai',
  'claude.ai', 'www.claude.ai', 'anthropic.com',
  'gemini.google.com',
  'copilot.microsoft.com',
  'deepseek.com', 'chat.deepseek.com',
  'grok.x.ai', 'x.ai',
  'phind.com', 'www.phind.com',
  'you.com', 'www.you.com',
])

/**
 * Returns a favicon URL for the referrer's domain, or null for non-URL referrers
 * (e.g. "Direct", "Unknown") or known services where the Phosphor icon is better.
 */
export function getReferrerFavicon(referrer: string): string | null {
  if (!referrer || typeof referrer !== 'string') return null
  const normalized = referrer.trim().toLowerCase()
  if (REFERRER_NO_FAVICON.includes(normalized)) return null
  // Plain names without a dot (e.g. "Instagram", "WhatsApp") are not real domains
  if (!normalized.includes('.')) return null
  try {
    const url = new URL(referrer.startsWith('http') ? referrer : `https://${referrer}`)
    const hostname = url.hostname.toLowerCase()
    // Use Phosphor icon for known services — Google favicons are unreliable for these
    if (REFERRER_PREFER_ICON.has(hostname)) return null
    // Also check if the label matches a known referrer (catches subdomains like search.google.com)
    const label = getReferrerLabel(hostname)
    if (REFERRER_DISPLAY_OVERRIDES[label]) return null
    return `${FAVICON_SERVICE_URL}?domain=${hostname}&sz=32`
  } catch {
    return null
  }
}
