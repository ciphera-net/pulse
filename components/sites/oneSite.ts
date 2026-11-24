// The new-sites beta's one-site rule (R124, 24-11-2026): a team with exactly one site never sees the Your Sites page,
// which opens that site's dashboard instead. While a site waits to be deleted the page still shows, so it can be
// restored there. Pure.
export function oneSiteTarget(siteIds: readonly string[], deletedCount: number): string | null {
  return siteIds.length === 1 && deletedCount === 0 ? siteIds[0] : null
}
