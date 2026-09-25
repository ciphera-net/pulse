/**
 * The query string for a date-ranged read: a server-resolved period token, OR explicit
 * dates — never both, so there is no question which one the server answered for.
 *
 * The only token a non-dashboard read sends is `all` ("All time"), which the server
 * resolves to the page's data window and exempts from the 366-day cap
 * (lib/dashboard/resolveRange serverResolvedPeriod). Every other view arrives here as
 * the dates it resolved to on the page's own wall clock.
 */
export function rangeQuery(startDate: string, endDate: string, period?: string): string {
  const params = new URLSearchParams()
  if (period) {
    params.set('period', period)
  } else {
    params.set('start_date', startDate)
    params.set('end_date', endDate)
  }
  return params.toString()
}
