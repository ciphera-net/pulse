import { SiteFavicon } from '@/components/sites/SiteFavicon'
import { displayDomain } from '@/lib/utils/displayDomain'

// ---------------------------------------------------------------------------
// The person's own site, on screen — favicon and domain in a hairline chip.
//
// The one thing all three rebuild directions shared and the old wizard lacked:
// from step 2 on, the flow is visibly about THEIR site, not a generic form.
// It also means no heading has to repeat the domain.
//
// SiteFavicon does the work: the app's own /api/favicon proxy, and on a miss a
// neutral monogram sized to the slot — so a brand-new domain with no icon yet
// (the usual case in a setup wizard) shows its first letter, never a broken
// image or an empty square. displayDomain renders punycode readably without
// changing the value (ruled 05-09).
// ---------------------------------------------------------------------------

interface SiteChipProps {
  domain: string
  name?: string
  className?: string
}

export default function SiteChip({ domain, name, className = '' }: SiteChipProps) {
  return (
    <span
      className={`inline-flex items-center gap-2 border border-neutral-800 px-3 py-1.5 text-sm text-neutral-200 ${className}`}
      data-testid="site-chip"
    >
      <SiteFavicon domain={domain} name={name} size={16} className="h-4 w-4 shrink-0" />
      {displayDomain({ domain })}
    </span>
  )
}
