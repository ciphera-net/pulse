'use client'

import { useState } from 'react'
import Image from 'next/image'
import { FAVICON_SERVICE_URL } from '@/lib/utils/favicon'

interface SiteFaviconProps {
  domain: string
  /** Site display name, used for the monogram fallback. */
  name?: string
  /** Rendered pixel size (also selects the proxy sz bucket). */
  size?: number
  className?: string
}

/**
 * Site favicon with a graceful fallback — the ONLY way to render a site's
 * favicon. The same-origin `/api/favicon` proxy 404s whenever the upstream has
 * no favicon for a domain (new sites, internal hosts, anything Google hasn't
 * crawled — id.ciphera.net is a live example). Without a fallback that
 * surfaces as the browser's broken-image box, so every render site must go
 * through this component; never render the proxy URL with a raw <img>. On
 * error we swap to a neutral monogram sized to `size`. `alt` is intentionally
 * empty — the favicon is decorative next to the visible site name.
 */
export function SiteFavicon({ domain, name, size = 40, className }: SiteFaviconProps) {
  const [failed, setFailed] = useState(false)
  const letter = (name?.trim()?.[0] ?? domain?.trim()?.[0] ?? '?').toUpperCase()

  if (failed) {
    return (
      <div
        aria-hidden
        className={`flex items-center justify-center bg-neutral-800 font-semibold text-neutral-400 ${className ?? ''}`}
        style={{ width: size, height: size, fontSize: Math.round(size * 0.5) }}
      >
        {letter}
      </div>
    )
  }

  return (
    <Image
      src={`${FAVICON_SERVICE_URL}?domain=${encodeURIComponent(domain)}&sz=${size >= 64 ? 128 : 64}`}
      alt=""
      width={size}
      height={size}
      className={className}
      unoptimized
      onError={() => setFailed(true)}
    />
  )
}
