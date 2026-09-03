'use client'

import { CaptureSlideshow } from './capture-slideshow'

/**
 * Visitors slideshow — real panel captures of the live ciphera.net dashboard
 * (the public /demo share), one surface at a time. Slides share identical
 * 1144×835 canvases (full card + a page-background margin, padded at cut time
 * so nothing is ever cropped mid-card).
 */
export function VisitorsSlideshow() {
  return (
    <CaptureSlideshow
      width={1144}
      height={835}
      alt="Pulse audience panel for ciphera.net, live data"
      slides={[
        { key: 'map', label: 'Map', file: '/marketing/panel-map-sep-2x.png' },
        { key: 'countries', label: 'Countries', file: '/marketing/panel-countries-sep-2x.png' },
        { key: 'pages', label: 'Top pages', file: '/marketing/panel-pages-sep-2x.png' },
        { key: 'referrers', label: 'Referrers', file: '/marketing/panel-referrers-sep-2x.png' },
        { key: 'browsers', label: 'Browsers', file: '/marketing/panel-browsers-sep-2x.png' },
      ]}
    />
  )
}
