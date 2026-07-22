import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { flagUrl, hasFlag } from '@/lib/flags'

interface CountryFlagProps {
  /** ISO 3166-1 alpha-2 country code (any case). */
  code?: string | null
  /**
   * Sizing / shape classes. `object-contain` is always applied so the 3:2 flag
   * keeps its aspect ratio (letterboxed) regardless of the box shape — matching
   * how the previous inline SVGs rendered (preserveAspectRatio="meet").
   */
  className?: string
  title?: string
  /** Rendered when no flag exists for the code (default: nothing). */
  fallback?: ReactNode
}

/**
 * A country flag, served as an <img> from the shared CDN (cdn.ciphera.net/flags).
 * Replaces the bundled `country-flag-icons` set. For codes we have no flag for —
 * e.g. GeoIP aggregate pseudo-codes like T1/A1/A2/O1/AP — it renders `fallback`
 * rather than a broken image, preserving the previous fallback behavior.
 */
export function CountryFlag({ code, className, title, fallback = null }: CountryFlagProps) {
  if (!hasFlag(code)) return <>{fallback}</>
  return (
    <img
      src={flagUrl(code as string)}
      alt=""
      title={title}
      loading="lazy"
      draggable={false}
      className={cn('object-contain', className)}
    />
  )
}
