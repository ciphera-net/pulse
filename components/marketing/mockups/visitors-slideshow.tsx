'use client'

import { CaptureSlideshow } from './capture-slideshow'

/**
 * Visitors slideshow — real panel captures of the live ciphera.net dashboard
 * (the public /demo share), one surface at a time. Slides share identical
 * 1220×884 canvases — the card's own measured bounding box, so the cut lands on
 * its border and nothing is ever cropped mid-card.
 *
 * Re-captured 19-09-2026. The 03-09 set showed the OLD hand-rolled underline
 * tab row; on 06-09 every one of these cards moved to the solid Facet Switcher,
 * and Referrers gained a third tab (Campaigns) when the Campaigns card was
 * folded into it.
 */
export function VisitorsSlideshow() {
  return (
    <CaptureSlideshow
      width={1220}
      height={884}
      alt="Pulse audience panel for ciphera.net, live data"
      slides={[
        { key: 'map', label: 'Map', file: '/marketing/panel-map-19-09-2026-2x.png' },
        { key: 'countries', label: 'Countries', file: '/marketing/panel-countries-19-09-2026-2x.png' },
        { key: 'pages', label: 'Top pages', file: '/marketing/panel-pages-19-09-2026-2x.png' },
        { key: 'referrers', label: 'Referrers', file: '/marketing/panel-referrers-19-09-2026-2x.png' },
        { key: 'browsers', label: 'Browsers', file: '/marketing/panel-browsers-19-09-2026-2x.png' },
      ]}
    />
  )
}
