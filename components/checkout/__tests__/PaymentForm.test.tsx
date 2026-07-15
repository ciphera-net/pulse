import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const createCheckoutSession = vi.fn()
vi.mock('@/lib/api/billing', () => ({
  createCheckoutSession: (...args: unknown[]) => createCheckoutSession(...args),
}))
vi.mock('@/lib/cdn', () => ({ cdnUrl: (p: string) => p }))

import PaymentForm from '../PaymentForm'

function renderForm() {
  return render(
    <PaymentForm
      plan="team"
      interval="month"
      limit={10000}
      country="BE"
      vatId=""
      businessName="Ciphera BV"
      billingEmail="billing@ciphera.net"
      address="Kerkstraat 1"
      city="Brussels"
      postalCode="1000"
    />,
  )
}

beforeEach(() => {
  createCheckoutSession.mockReset()
  // window.location.href assignment must not throw in jsdom.
  Object.defineProperty(window, 'location', { value: { href: '' }, writable: true })
})

describe('PaymentForm', () => {
  it('exposes a payment-method radiogroup with radio options', () => {
    renderForm()
    expect(screen.getByRole('radiogroup', { name: 'Payment method' })).toBeTruthy()
    const radios = screen.getAllByRole('radio')
    expect(radios.length).toBe(5)
    // Roving tabindex: exactly one option is the tab stop before selection.
    expect(radios.filter((r) => r.getAttribute('tabindex') === '0').length).toBe(1)
  })

  it('marks the selected method with aria-checked', () => {
    renderForm()
    const cards = screen.getByRole('radio', { name: 'Cards' })
    fireEvent.click(cards)
    expect(cards.getAttribute('aria-checked')).toBe('true')
  })

  it('only fires one checkout call on a rapid double submit', async () => {
    // A never-resolving promise keeps the request in flight so a second submit
    // would slip through if only React state guarded it.
    createCheckoutSession.mockReturnValue(new Promise(() => {}))
    renderForm()
    fireEvent.click(screen.getByRole('radio', { name: 'Cards' }))
    const submit = screen.getByRole('button', { name: /Proceed to payment/i })
    fireEvent.click(submit)
    fireEvent.click(submit)
    await waitFor(() => expect(createCheckoutSession).toHaveBeenCalledTimes(1))
  })
})
