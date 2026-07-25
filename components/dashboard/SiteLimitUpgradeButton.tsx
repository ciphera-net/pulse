/**
 * @file Single-control upgrade CTA shown when the plan's site limit is reached.
 */

import Link from 'next/link'

interface SiteLimitUpgradeButtonProps {
  used: number
  limit: number
}

/**
 * One fused control: the upgrade action with the current usage welled into it
 * as a darker-orange counter (Facet brand.button tone). Replaces the previous
 * "Limit reached (n/n)" chip + separate Upgrade button, which read as two
 * competing box-shaped controls and framed a paid ceiling as an error.
 */
export default function SiteLimitUpgradeButton({ used, limit }: SiteLimitUpgradeButtonProps) {
  return (
    <Link
      href="/switch"
      aria-label={`${used} of ${limit} sites used — upgrade for more`}
      className="group inline-flex h-9 items-stretch rounded-none bg-brand-orange text-sm font-medium text-white transition-colors duration-fast hover:bg-brand-orange-hover"
    >
      <span className="flex items-center pl-4 pr-3">Upgrade for more sites</span>
      <span className="ml-0.5 flex items-center bg-brand-orange-button px-2.5 text-xs tabular-nums text-orange-100 transition-colors duration-fast group-hover:bg-brand-orange-button-hover">
        {used}/{limit}
      </span>
    </Link>
  )
}
