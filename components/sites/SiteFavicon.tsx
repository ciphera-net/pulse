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
 * Site favicon with a graceful fallback. The same-origin `/api/favicon` proxy
 * 404s whenever the upstream has no favicon for a domain (new sites, internal
 * hosts, anything Google hasn't crawled). Without a fallback that surfaces as
 * the browser's broken-image box with the alt text bleeding into it. On error
 * we swap to a neutral monogram instead. `alt` is intentionally empty — the
 * favicon is decorative next to the visible site name.
 */
export function SiteFavicon({ domain, name, size = 40, className }: SiteFaviconProps) {
  const [failed, setFailed] = useState(false)
  const letter = (name?.trim()?.[0] ?? domain?.trim()?.[0] ?? '?').toUpperCase()

  if (failed) {
    return (
      <div
        aria-hidden
        className={`flex h-full w-full items-center justify-center bg-neutral-800 font-semibold text-neutral-400 ${className ?? ''}`}
        style={{ fontSize: Math.round(size * 0.5) }}
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
