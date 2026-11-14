/**
 * Pictures requested and decoded BEFORE the element that shows them exists.
 *
 * A dashboard row's icon is an <img> that mounts with its row, and every tab switch or page of a list unmounts the
 * rows and mounts new ones. So an icon the browser does not hold yet was asked for only once its row had painted,
 * and arrived a round trip later: the next page of a list, the site picker on its first opening, the What's new
 * picture after its panel had opened.
 *
 * (An earlier version of this note gave times, "rows at about 140 ms, icons between 250 and 850 ms". They came
 * from a test harness that routes every request, which switches the browser's cache off, so they showed every
 * icon as late on every mount. With the cache on, an icon the browser holds is complete in the same task as its
 * row. What this module buys is the FIRST showing: the icon is already held when its row arrives.)
 *
 * preloadImages() starts the request as soon as the caller knows the address (when the data arrives, or when the
 * neighbouring page becomes the next click) and keeps the decoded picture referenced, so an <img> with the same
 * address is served from memory. The <img> itself has to be `loading="eager"`: a lazy image waits for layout
 * however warm the cache is.
 *
 * What this cannot do: make a picture the server marks as uncacheable stay. Whether a kept picture may be reused
 * is the response's `Cache-Control` to decide.
 */

/** Enough for every list of a dashboard and a long site list; the oldest entry leaves first. */
const MAX_KEPT = 400

const kept = new Map<string, HTMLImageElement>()

export function preloadImages(urls: Iterable<string | null | undefined>): void {
  if (typeof window === 'undefined' || typeof window.Image !== 'function') return
  for (const url of urls) {
    if (!url) continue
    const held = kept.get(url)
    if (held) {
      // Asked for again: it is the newest entry now, so it leaves last.
      kept.delete(url)
      kept.set(url, held)
      continue
    }
    const img = new window.Image()
    img.decoding = 'async'
    // A picture that fails is forgotten: the element that shows it reports the failure itself (a monogram, a
    // globe), and a later call may try again.
    const forget = () => {
      if (kept.get(url) === img) kept.delete(url)
    }
    img.addEventListener('error', forget, { once: true })
    img.src = url
    kept.set(url, img)
    if (typeof img.decode === 'function') img.decode().catch(forget)
    if (kept.size > MAX_KEPT) {
      const oldest = kept.keys().next().value
      if (oldest !== undefined) kept.delete(oldest)
    }
  }
}

/** How many pictures are being kept (tests). */
export function preloadedImageCount(): number {
  return kept.size
}

/** Forgets every kept picture (tests). */
export function forgetPreloadedImages(): void {
  kept.clear()
}
