import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import type { VATResult } from '@/lib/api/billing'

// --- Mocks ---------------------------------------------------------------

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

// GET /api/billing/catalog's 10k tier (list A+, 07-11-2026): cents with VAT, the year the server's own figure.
vi.mock('swr', () => ({
  default: () => ({ data: { currency: 'EUR', vat_rate: 21, yearly_months: 10, plans: { business: [{ limit: 10000, month: { price: 900, business_price: 744 }, year: { price: 9000, business_price: 7438 } }] } } }),
}))

const calculateVAT = vi.fn()
vi.mock('@/lib/api/billing', () => ({
  calculateVAT: (...args: unknown[]) => calculateVAT(...args),
  getCatalog: vi.fn(),
}))

vi.mock('@/lib/countries', () => ({
  COUNTRY_OPTIONS: [
    { value: 'BE', label: 'Belgium' },
    { value: 'DE', label: 'Germany' },
  ],
}))

// Minimal Select stub that renders an ordinary <select> so tests can drive it.
vi.mock('@/components/ui/select', () => ({
  default: ({ value, onChange, options }: any) => (
    <select data-testid="select" value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o: any) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  ),
}))

import PlanSummary from '../PlanSummary'

function vat(rate: number): VATResult {
  return {
    base_amount: '10.00',
    vat_rate: rate,
    vat_amount: (rate / 10).toFixed(2),
    total_amount: (10 + rate / 10).toFixed(2),
    vat_exempt: false,
    vat_reason: '',
  }
}

const noop = () => {}

function renderSummary(country: string) {
  return render(
    <PlanSummary
      plan="team"
      interval="month"
      onIntervalChange={noop}
      limit={10000}
      country={country}
      vatId=""
      verifiedVatId=""
      onVerifiedVatIdChange={noop}
      onCountryChange={noop}
      onVatIdChange={noop}
      businessName=""
      onBusinessNameChange={noop}
      billingEmail=""
      onBillingEmailChange={noop}
      address=""
      onAddressChange={noop}
      city=""
      onCityChange={noop}
      postalCode=""
      onPostalCodeChange={noop}
    />,
  )
}

beforeEach(() => {
  calculateVAT.mockReset()
})

describe('PlanSummary VAT race', () => {
  it('applies only the latest request result when responses resolve out of order', async () => {
    // First render (BE) gets a slow promise; the country change (DE) gets a
    // fast one. Even though BE resolves LAST, the DE (latest) result must win.
    let resolveBE!: (v: VATResult) => void
    const bePromise = new Promise<VATResult>((r) => { resolveBE = r })
    const dePromise = Promise.resolve(vat(19)) // Germany 19%

    calculateVAT
      .mockReturnValueOnce(bePromise) // BE (21%) — resolves later
      .mockReturnValueOnce(dePromise) // DE (19%) — resolves first

    const { rerender } = renderSummary('BE')

    // Trigger the country change to DE by re-rendering with the new prop.
    rerender(
      <PlanSummary
        plan="team" interval="month" onIntervalChange={noop} limit={10000} country="DE" vatId=""
        verifiedVatId="" onVerifiedVatIdChange={noop}
        onCountryChange={noop} onVatIdChange={noop}
        businessName="" onBusinessNameChange={noop}
        billingEmail="" onBillingEmailChange={noop}
        address="" onAddressChange={noop}
        city="" onCityChange={noop}
        postalCode="" onPostalCodeChange={noop}
      />,
    )

    // DE resolves first and applies.
    await waitFor(() => expect(screen.getByText('VAT 19%')).toBeTruthy())

    // Now the stale BE request finally resolves — it must be ignored.
    await act(async () => {
      resolveBE(vat(21))
      await Promise.resolve()
    })

    expect(screen.getByText('VAT 19%')).toBeTruthy()
    expect(screen.queryByText('VAT 21%')).toBeNull()
  })

  it('renders the plan name via formatPlanName (legacy price_ ids become "Pro")', () => {
    calculateVAT.mockResolvedValue(vat(21))
    render(
      <PlanSummary
        plan="price_legacy123" interval="month" onIntervalChange={noop} limit={10000} country="" vatId=""
        verifiedVatId="" onVerifiedVatIdChange={noop}
        onCountryChange={noop} onVatIdChange={noop}
        businessName="" onBusinessNameChange={noop}
        billingEmail="" onBillingEmailChange={noop}
        address="" onAddressChange={noop}
        city="" onCityChange={noop}
        postalCode="" onPostalCodeChange={noop}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Pro' })).toBeTruthy()
  })
})

describe('PlanSummary before a country is chosen', () => {
  function renderBusiness(interval: 'month' | 'year') {
    return render(
      <PlanSummary
        plan="business" interval={interval} onIntervalChange={noop} limit={10000} country="" vatId=""
        verifiedVatId="" onVerifiedVatIdChange={noop}
        onCountryChange={noop} onVatIdChange={noop}
        businessName="" onBusinessNameChange={noop}
        billingEmail="" onBillingEmailChange={noop}
        address="" onAddressChange={noop}
        city="" onCityChange={noop}
        postalCode="" onPostalCodeChange={noop}
      />,
    )
  }

  it('shows the price without VAT for a month, from the catalog', () => {
    renderBusiness('month')
    expect(screen.getByText('Subtotal (10k events)').nextElementSibling!.textContent).toBe('€7.44')
    expect(screen.getByText('excl. VAT').closest('div')!.textContent).toBe('Total /mo excl. VAT€7.44')
    expect(calculateVAT).not.toHaveBeenCalled()
  })

  it('shows the year without VAT as the server prices it, never 10 × the month', () => {
    renderBusiness('year')
    // €74.38, not 10 × €7.44 = €74.40.
    expect(screen.getByText('Subtotal (10k events)').nextElementSibling!.textContent).toBe('€74.38')
    expect(screen.getByText('€6.20/mo · 2 months free')).toBeTruthy()
  })
})
