'use client'

import Image from 'next/image'
import { getReferrerFavicon, getReferrerIcon } from '@/lib/utils/icons'

/**
 * A destination's icon, by the Sources block's own rules (lib/utils/icons.tsx): one drawing for one site, wherever
 * it is listed. The house's own artwork for a site it knows, the site's favicon through the app's proxy for any
 * other, the globe where there is none. Drawn by the Pages block's Outbound tab and by the Events block's values
 * that are links.
 *
 * `failed` is kept by the caller, so an icon that failed to load once stays the house icon and is not asked for again.
 */
export function DestinationIcon({ host, failed, onFail }: { host: string; failed: boolean; onFail: () => void }) {
  const url = getReferrerFavicon(host)
  if (url && !failed) {
    return (
      <Image
        src={url}
        alt=""
        width={20}
        height={20}
        className="w-5 h-5 flex-shrink-0 rounded-none object-contain"
        // Eager and decoded with the row, as in Sources: the row's page flip is the only moment the icon is looked at.
        loading="eager"
        decoding="sync"
        onError={onFail}
        // A 16 px answer is the proxy's own stand-in for "no icon": the house icon is drawn instead, as in Sources.
        onLoad={(e) => {
          if (e.currentTarget.naturalWidth <= 16) onFail()
        }}
        unoptimized
      />
    )
  }
  return <span className="w-5 h-5 flex-shrink-0 flex items-center justify-center">{getReferrerIcon(host)}</span>
}
