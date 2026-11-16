'use client'

import { useState, type ReactNode } from 'react'

/**
 * A site's favicon, or `fallback` when there is none to draw (16-11-2026). The Sources block's rule
 * (components/dashboard/DestinationIcon.tsx): a load that fails, or an answer of 16 px or less, which is the favicon
 * proxy's own stand-in for "no icon", draws the fallback instead (the house's artwork for a site it knows, the globe
 * for any other). Without it the Filter menu drew the browser's broken-image mark for a referrer with no favicon.
 *
 * A bare <img>, unsized: the caller sizes it (`[&>img]:h-4`), as it sizes the fallback's svg. Give it `key={url}` so
 * a row reused for another site starts again.
 */
export function FaviconOr({ url, fallback }: { url: string; fallback: ReactNode }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <>{fallback}</>
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a 16 px icon in a menu row: next/image adds nothing here
    <img
      src={url}
      alt=""
      loading="lazy"
      data-favicon=""
      onError={() => setFailed(true)}
      onLoad={(e) => {
        if (e.currentTarget.naturalWidth <= 16) setFailed(true)
      }}
    />
  )
}
