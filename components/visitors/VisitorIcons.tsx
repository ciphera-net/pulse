'use client'

import { Monitor, DeviceMobile, DeviceTablet } from '@phosphor-icons/react'
import { FAVICON_SERVICE_URL } from '@/lib/utils/favicon'
import { cdnOrigin } from '@/lib/flags'
import { cn } from '@/lib/utils'

// ─── The Visitors icon kit (approved design §9a, "Icon assets") ─────
//
// HOUSE ASSETS ONLY. Nothing here hot-links a third-party CDN: brand marks come
// from our own cdn.ciphera.net when we host them, and otherwise from the app's
// own /api/favicon proxy, which Sigil resolves server-side so a customer's
// browser never talks to a vendor's domain (and never leaks a referrer to one).
//
// 🔑 The CDN path is tried FIRST and the proxy is the fallback, per §9a. Both
// render the same mark, so uploading the SVG set later changes where the bytes
// come from and not a single pixel — no code change, no visual review.
// Until then the proxy is the live path, and it is the one the approved round-4
// render was made with.

/** Vendor domains the favicon proxy is known to resolve (verified round 4). */
const BROWSER_DOMAIN: Record<string, string> = {
  firefox: 'firefox.com',
  chrome: 'chromium.org',
  chromium: 'chromium.org',
  safari: 'apple.com',
  edge: 'microsoft.com',
  opera: 'opera.com',
  brave: 'brave.com',
  vivaldi: 'vivaldi.com',
  samsung: 'samsung.com',
  duckduckgo: 'duckduckgo.com',
}

const OS_DOMAIN: Record<string, string> = {
  windows: 'microsoft.com',
  macos: 'apple.com',
  'mac os': 'apple.com',
  ios: 'apple.com',
  ipados: 'apple.com',
  linux: 'kernel.org',
  ubuntu: 'ubuntu.com',
  fedora: 'fedoraproject.org',
  debian: 'debian.org',
  android: 'android.com',
  chromeos: 'chromium.org',
  'chrome os': 'chromium.org',
}

/**
 * normaliseVendor reduces a stored browser/OS string to a lookup key.
 *
 * The columns hold whatever the UA parser produced — "Mobile Safari", "Chrome
 * 129", "Mac OS X". Matching on a PREFIX of the normalised string rather than
 * on equality is what makes those resolve without a table of every version
 * string ever seen.
 */
function normaliseVendor(value: string, table: Record<string, string>): string | null {
  const v = value.toLowerCase().trim()
  for (const key of Object.keys(table)) {
    if (v.includes(key)) return table[key]
  }
  return null
}

function brandCdnUrl(slug: string): string {
  // Brand marks live at the CDN ORIGIN ROOT, beside /flags — deliberately
  // outside the app's cdnUrl() '/pulse' prefix, exactly like flags. Using
  // cdnUrl() here would 404.
  return `${cdnOrigin()}/brands/${slug}.svg`
}

/** Slugs we would self-host, if and when the SVG set is uploaded. */
const BRAND_SLUG: Record<string, string> = {
  'firefox.com': 'firefox',
  'chromium.org': 'chrome',
  'apple.com': 'apple',
  'microsoft.com': 'windows',
  'kernel.org': 'linux',
  'android.com': 'android',
}

/**
 * VendorMark renders one brand icon, CDN-first with the favicon proxy as the
 * fallback, and renders NOTHING if neither resolves.
 *
 * Nothing, not a placeholder: a generic grey square beside a browser name reads
 * as "we could not identify this browser", which is a different and false
 * statement from "we have no artwork for it". The name text beside it already
 * carries the information.
 */
function VendorMark({ domain, className }: { domain: string; className?: string }) {
  const slug = BRAND_SLUG[domain]
  return (
    <img
      src={slug ? brandCdnUrl(slug) : `${FAVICON_SERVICE_URL}?domain=${domain}&sz=32`}
      alt=""
      aria-hidden="true"
      loading="lazy"
      draggable={false}
      className={cn('size-3.5 shrink-0 rounded-none object-contain', className)}
      onError={(e) => {
        const el = e.currentTarget
        const proxy = `${FAVICON_SERVICE_URL}?domain=${domain}&sz=32`
        // One fallback hop, then give up — without the guard a proxy that also
        // fails would loop the browser through the same two URLs forever.
        if (el.src.endsWith('.svg') && slug) {
          el.src = proxy
          return
        }
        el.style.display = 'none'
      }}
    />
  )
}

export function BrowserMark({ browser, className }: { browser?: string | null; className?: string }) {
  if (!browser) return null
  const domain = normaliseVendor(browser, BROWSER_DOMAIN)
  if (!domain) return null
  return <VendorMark domain={domain} className={className} />
}

export function OSMark({ os, className }: { os?: string | null; className?: string }) {
  if (!os) return null
  const domain = normaliseVendor(os, OS_DOMAIN)
  if (!domain) return null
  return <VendorMark domain={domain} className={className} />
}

export function ReferrerMark({ referrer, className }: { referrer?: string | null; className?: string }) {
  const domain = referrerDomain(referrer)
  if (!domain) return null
  return <VendorMark domain={domain} className={className} />
}

/**
 * DeviceGlyph is a monochrome Phosphor outline, per §9a — device type is a
 * SHAPE, not a brand, so it is drawn rather than fetched.
 */
export function DeviceGlyph({ device, className }: { device?: string | null; className?: string }) {
  if (!device) return null
  const Icon =
    device.toLowerCase() === 'mobile'
      ? DeviceMobile
      : device.toLowerCase() === 'tablet'
        ? DeviceTablet
        : Monitor
  return (
    <Icon
      className={cn('size-3.5 shrink-0 text-neutral-400', className)}
      weight="regular"
      aria-hidden="true"
    />
  )
}

/**
 * referrerDomain extracts a bare host from a stored referrer.
 *
 * Returns null for a missing referrer AND for one that will not parse — the
 * caller then renders "Direct" or an em dash rather than a broken icon. A
 * referrer with no host is not a vendor; it is an absence.
 */
export function referrerDomain(referrer?: string | null): string | null {
  if (!referrer) return null
  try {
    const host = new URL(referrer.includes('://') ? referrer : `https://${referrer}`).hostname
    return host.replace(/^www\./, '') || null
  } catch {
    return null
  }
}

/**
 * referrerLabel is the human name beside the mark. "Direct" is the honest word
 * for no referrer — the visit happened, it just arrived without one.
 */
export function referrerLabel(referrer?: string | null): string {
  const domain = referrerDomain(referrer)
  if (!domain) return 'Direct'
  const known: Record<string, string> = {
    'google.com': 'Google',
    'news.ycombinator.com': 'Hacker News',
    'duckduckgo.com': 'DuckDuckGo',
    'bing.com': 'Bing',
    'github.com': 'GitHub',
    'linkedin.com': 'LinkedIn',
    'reddit.com': 'Reddit',
    'x.com': 'X',
    't.co': 'X',
  }
  return known[domain] ?? domain
}
