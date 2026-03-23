import React from 'react'
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

const SI = { size: 16 } as const

export function getReferrerIcon(referrerName: string) {
  if (!referrerName) return <Globe className="text-neutral-400" />
  const lower = referrerName.toLowerCase()
  // Direct traffic
  if (lower === 'direct') return <CursorClick className="text-neutral-500" />
  // Browsers as referrers (e.g. googlechrome.com, firefox.com)
  if (lower.includes('googlechrome') || lower.includes('chrome')) return <img src="/icons/browsers/chrome.svg" alt="Chrome" width={16} height={16} className="inline-block" />
  // Social / platforms
  if (lower.includes('google') && !lower.includes('gemini')) return <SiGoogle size={SI.size} color="#4285F4" />
  if (lower.includes('facebook') || lower === 'fb') return <SiFacebook size={SI.size} color="#0866FF" />
  if (lower.includes('twitter') || lower.includes('t.co') || lower.includes('x.com')) return <XIcon />
  if (lower.includes('linkedin')) return <LinkedInIcon />
  if (lower.includes('instagram') || lower === 'ig') return <SiInstagram size={SI.size} color="#E4405F" />
  if (lower.includes('github')) return <SiGithub size={SI.size} color="#fff" />
  if (lower.includes('youtube')) return <SiYoutube size={SI.size} color="#FF0000" />
  if (lower.includes('reddit')) return <SiReddit size={SI.size} color="#FF4500" />
  if (lower.includes('whatsapp')) return <SiWhatsapp size={SI.size} color="#25D366" />
  if (lower.includes('telegram')) return <SiTelegram size={SI.size} color="#26A5E4" />
  if (lower.includes('snapchat')) return <SiSnapchat size={SI.size} color="#FFFC00" />
  if (lower.includes('pinterest')) return <SiPinterest size={SI.size} color="#BD081C" />
  if (lower.includes('threads')) return <SiThreads size={SI.size} color="#fff" />
  if (lower.includes('discord')) return <SiDiscord size={SI.size} color="#5865F2" />
  // Search engines
  if (lower.includes('bing')) return <BingIcon />
  if (lower.includes('duckduckgo')) return <SiDuckduckgo size={SI.size} color="#DE5833" />
  if (lower.includes('brave')) return <SiBrave size={SI.size} color="#FB542B" />
  // AI assistants
  if (lower.includes('chatgpt') || lower.includes('openai')) return <OpenAIIcon />
  if (lower.includes('perplexity')) return <SiPerplexity size={SI.size} color="#1FB8CD" />
  if (lower.includes('claude') || lower.includes('anthropic')) return <SiAnthropic size={SI.size} color="#D97757" />
  if (lower.includes('gemini')) return <SiGooglegemini size={SI.size} color="#8E75B2" />
  if (lower.includes('copilot')) return <SiGithubcopilot size={SI.size} color="#fff" />
  if (lower.includes('deepseek')) return <OpenAIIcon color="#4D6BFE" />
  if (lower.includes('grok') || lower.includes('x.ai')) return <XIcon />
  // Shared Link
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
  ig: 'Instagram',
  fb: 'Facebook',
  yt: 'YouTube',
  googlechrome: 'Google Chrome',
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
  if (!hostname) {
    // Plain names without a dot (e.g. "Ig", "Direct") — check override map before returning raw
    const overrideByPlain = REFERRER_DISPLAY_OVERRIDES[trimmed.toLowerCase()]
    if (overrideByPlain) return overrideByPlain
    return trimmed
  }
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
