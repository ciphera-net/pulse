// Centralised money formatting for Pulse — the ONE euro formatter.
//
// Before this existed, prices rendered through at least three shapes in one
// screen: raw template strings (`€${n}` → "€12.5", "€9", "€209"), ad-hoc
// Intl.NumberFormat instances, and hardcoded "€" next to a bare number. One
// formatter, two decimals, everywhere — "€12.50", "€9.00", "€209.00".
//
// Locale is pinned to en-GB for the same reason lib/utils/formatDate.ts pins
// it: a deterministic rendering ("€253.00", symbol first, dot decimals) that
// does not depend on the viewer's runtime locale/ICU. Amounts are EUR-first
// because the product bills in EUR; the cents variant takes an optional
// currency for records (invoices) that carry their own.

const formatterCache = new Map<string, Intl.NumberFormat>()

function formatterFor(currency: string): Intl.NumberFormat {
  let fmt = formatterCache.get(currency)
  if (!fmt) {
    fmt = new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    formatterCache.set(currency, fmt)
  }
  return fmt
}

/** "€253.00" — a whole-currency amount (EUR euros, not cents). */
export function formatEuro(amount: number): string {
  return formatterFor('EUR').format(amount)
}

/** "€253.00" from 25300 — an amount stored in cents (the API's native unit). */
export function formatEuroCents(cents: number): string {
  return formatterFor('EUR').format(cents / 100)
}

/**
 * Cents with the record's own currency (invoices carry one on the wire).
 * Falls back to EUR when the record predates the currency column.
 */
export function formatMoneyCents(cents: number, currency?: string | null): string {
  return formatterFor(currency || 'EUR').format(cents / 100)
}
