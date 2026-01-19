import type { Site } from '@/lib/api/sites'

const DOCS_URL =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_APP_URL)
    ? `${process.env.NEXT_PUBLIC_APP_URL}/faq`
    : 'https://pulse.ciphera.net/faq'

/**
 * Generates a privacy-policy snippet for the site's use of Pulse.
 * The text is derived from the site's data collection and filtering settings
 * and is intended to be copied into the site owner's Privacy Policy page.
 * This is for transparency (GDPR Art. 13/14); it is not a cookie banner.
 *
 * @param site - The site with current saved settings
 * @returns Plain-text snippet, two paragraphs
 */
export function generatePrivacySnippet(site: Site): string {
  const paths = site.collect_page_paths ?? true
  const referrers = site.collect_referrers ?? true
  const device = site.collect_device_info ?? true
  const geo = site.collect_geo_data || 'full'
  const screen = site.collect_screen_resolution ?? true
  const perf = site.enable_performance_insights ?? false
  const replay = site.replay_mode === 'anonymous_skeleton'
  const filterBots = site.filter_bots ?? true

  const parts: string[] = []
  if (paths) parts.push('which pages are viewed')
  if (referrers) parts.push('where visitors come from (referrer)')
  if (device) parts.push('device type, browser, and operating system')
  if (geo === 'full') parts.push('country, region, and city')
  else if (geo === 'country') parts.push('country')
  if (screen) parts.push('screen resolution')
  if (perf) parts.push('Core Web Vitals (e.g. page load performance)')
  if (replay) parts.push('anonymised session replays (e.g. clicks and layout; no text you type is stored)')

  const list =
    parts.length > 0
      ? parts.join(', ')
      : 'minimal anonymous data about site usage (e.g. that a page was viewed)'

  const p1 =
    'We use Pulse to understand how visitors use our site. Ciphera does not use cookies or other persistent identifiers. A cookie consent banner is not required for Pulse. We respect Do Not Track (DNT) browser settings.'

  let p2 = `We collect anonymous data: ${list}. `
  if (filterBots) {
    p2 += 'Known bots and referrer spam are excluded from our analytics. '
  }
  p2 += `Data is processed in a privacy-preserving way and is not used to identify individuals. For more information, see Pulse's documentation: ${DOCS_URL}`

  return `${p1}\n\n${p2}`
}
