import React from 'react'
import { 
  FaChrome, 
  FaFirefox, 
  FaSafari, 
  FaEdge, 
  FaOpera, 
  FaInternetExplorer, 
  FaWindows, 
  FaApple, 
  FaLinux, 
  FaAndroid, 
  FaDesktop, 
  FaMobileAlt, 
  FaTabletAlt, 
  FaGoogle, 
  FaFacebook, 
  FaLinkedin, 
  FaInstagram, 
  FaGithub, 
  FaYoutube, 
  FaReddit,
  FaQuestion,
  FaGlobe
} from 'react-icons/fa'
import { FaXTwitter } from 'react-icons/fa6'
import { SiBrave } from 'react-icons/si'
import { MdDeviceUnknown, MdSmartphone, MdTabletMac, MdDesktopWindows } from 'react-icons/md'

export function getBrowserIcon(browserName: string) {
  if (!browserName) return <FaGlobe className="text-neutral-400" />
  const lower = browserName.toLowerCase()
  if (lower.includes('chrome')) return <FaChrome className="text-blue-500" />
  if (lower.includes('firefox')) return <FaFirefox className="text-orange-500" />
  if (lower.includes('safari')) return <FaSafari className="text-blue-400" />
  if (lower.includes('edge')) return <FaEdge className="text-blue-600" />
  if (lower.includes('opera')) return <FaOpera className="text-red-500" />
  if (lower.includes('ie') || lower.includes('explorer')) return <FaInternetExplorer className="text-blue-500" />
  if (lower.includes('brave')) return <SiBrave className="text-orange-600" />
  
  return <FaGlobe className="text-neutral-400" />
}

export function getOSIcon(osName: string) {
  if (!osName) return <MdDeviceUnknown className="text-neutral-400" />
  const lower = osName.toLowerCase()
  if (lower.includes('win')) return <FaWindows className="text-blue-500" />
  if (lower.includes('mac') || lower.includes('ios')) return <FaApple className="text-neutral-800 dark:text-neutral-200" />
  if (lower.includes('linux') || lower.includes('ubuntu') || lower.includes('debian')) return <FaLinux className="text-neutral-800 dark:text-neutral-200" />
  if (lower.includes('android')) return <FaAndroid className="text-green-500" />
  
  return <MdDeviceUnknown className="text-neutral-400" />
}

export function getDeviceIcon(deviceName: string) {
  if (!deviceName) return <MdDeviceUnknown className="text-neutral-400" />
  const lower = deviceName.toLowerCase()
  if (lower.includes('mobile') || lower.includes('phone')) return <MdSmartphone className="text-neutral-500" />
  if (lower.includes('tablet') || lower.includes('ipad')) return <MdTabletMac className="text-neutral-500" />
  if (lower.includes('desktop') || lower.includes('laptop')) return <MdDesktopWindows className="text-neutral-500" />
  
  return <MdDeviceUnknown className="text-neutral-400" />
}

export function getReferrerIcon(referrerName: string) {
  if (!referrerName) return <FaGlobe className="text-neutral-400" />
  const lower = referrerName.toLowerCase()
  if (lower.includes('google')) return <FaGoogle className="text-blue-500" />
  if (lower.includes('facebook')) return <FaFacebook className="text-blue-600" />
  if (lower.includes('twitter') || lower.includes('t.co') || lower.includes('x.com')) return <FaXTwitter className="text-neutral-800 dark:text-neutral-200" />
  if (lower.includes('linkedin')) return <FaLinkedin className="text-blue-700" />
  if (lower.includes('instagram')) return <FaInstagram className="text-pink-600" />
  if (lower.includes('github')) return <FaGithub className="text-neutral-800 dark:text-neutral-200" />
  if (lower.includes('youtube')) return <FaYoutube className="text-red-600" />
  if (lower.includes('reddit')) return <FaReddit className="text-orange-600" />
  
  // Try to use a generic globe or maybe check if it is a URL
  return <FaGlobe className="text-neutral-400" />
}

const REFERRER_NO_FAVICON = ['direct', 'unknown', '']

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
  tumblr: 'Tumblr',
  quora: 'Quora',
  't.co': 'X',
  'x.com': 'X',
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
  try {
    const url = new URL(referrer.startsWith('http') ? referrer : `https://${referrer}`)
    if (REFERRER_USE_X_ICON.has(url.hostname.toLowerCase())) return null
    return `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=32`
  } catch {
    return null
  }
}
