import { describe, it, expect } from 'vitest'
import { formatEuro, formatEuroCents, formatMoneyCents } from '../money'

describe('money formatting (ruled F3: one Intl EUR formatter, two decimals)', () => {
  it('always renders two decimals — the raw-template bugs ("€12.5", "€9") are unrepresentable', () => {
    expect(formatEuro(12.5)).toBe('€12.50')
    expect(formatEuro(9)).toBe('€9.00')
    expect(formatEuro(209)).toBe('€209.00')
  })

  it('groups thousands and pins the locale, independent of the runtime default', () => {
    expect(formatEuro(1210)).toBe('€1,210.00')
    expect(formatEuroCents(121000)).toBe('€1,210.00')
  })

  it('converts cents without floating-point drift at the boundaries', () => {
    expect(formatEuroCents(1)).toBe('€0.01')
    expect(formatEuroCents(847)).toBe('€8.47')
    expect(formatEuroCents(0)).toBe('€0.00')
  })

  it('formatMoneyCents honours a record currency and falls back to EUR when absent', () => {
    expect(formatMoneyCents(4700, 'EUR')).toBe('€47.00')
    // Absent currency must fall back, not throw — Intl.NumberFormat throws on
    // undefined currency, which blanked the notification center (F-B13).
    expect(formatMoneyCents(4700, undefined)).toBe('€47.00')
    expect(formatMoneyCents(4700, null)).toBe('€47.00')
    expect(formatMoneyCents(4700, '')).toBe('€47.00')
    // A non-EUR record keeps its own currency symbol.
    expect(formatMoneyCents(4700, 'USD')).toContain('47.00')
    expect(formatMoneyCents(4700, 'USD')).not.toContain('€')
  })
})
