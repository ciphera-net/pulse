import { describe, it, expect } from 'vitest'
import { renderNotification } from '../index'
import type { Receipt } from '@/lib/notifications/types'

describe('billing_payment_failed renderer', () => {
  it('renders amount and invoice number', () => {
    const r: Receipt = {
      user_id: 'u', event_id: 'e', delivered_at: null, read_at: null,
      event: {
        id: 'e', organization_id: 'o', type: 'billing_payment_failed',
        payload: {
          invoice_id: 'A-4521',
          amount: 4700,
          currency: 'EUR',
          error_code: 'insufficient_funds',
          retry_at: '2026-04-19T00:00:00Z',
        },
        link_url: null, link_label_key: null,
        created_at: '2026-04-15T12:00:00Z', expires_at: '2026-07-14T12:00:00Z',
      },
    }
    const { title, body } = renderNotification(r)
    expect(title).toBe('Payment failed — Invoice #A-4521')
    expect(body).toMatch(/€47\.00/)
  })
})

describe('billing_plan_renewed renderer', () => {
  it('renders next billing date', () => {
    const r: Receipt = {
      user_id: 'u', event_id: 'e', delivered_at: null, read_at: null,
      event: {
        id: 'e', organization_id: 'o', type: 'billing_plan_renewed',
        payload: { plan_id: 'pro', next_billing_at: '2026-05-15T00:00:00Z' },
        link_url: null, link_label_key: null,
        created_at: '2026-04-15T12:00:00Z', expires_at: '2026-07-14T12:00:00Z',
      },
    }
    const { title, body } = renderNotification(r)
    expect(title).toBe('Your plan renewed')
    expect(body).toMatch(/15\/05\/2026/)
  })
})

describe('billing_pageview_100 renderer', () => {
  it('states the ruled overage mechanics, never a hard cut-off', () => {
    // Fires at 100% of PLAN limit, where collection has NOT stopped (WS1.1
    // ruling: continues to 2x, then pauses). "No longer being recorded" is
    // true only at the hard ceiling and belongs to the ceiling banner.
    const r: Receipt = {
      user_id: 'u', event_id: 'e', delivered_at: null, read_at: null,
      event: {
        id: 'e', organization_id: 'o', type: 'billing_pageview_100',
        payload: { limit_type: 'pageviews', percent_used: 100 },
        link_url: null, link_label_key: null,
        created_at: '2026-04-15T12:00:00Z', expires_at: '2026-07-14T12:00:00Z',
      },
    }
    const { title, body } = renderNotification(r)
    expect(title).toBe('Pageview limit reached')
    expect(body).toMatch(/Collection continues up to 2x/)
    expect(body).not.toMatch(/no longer being recorded/)
  })
})

describe('billing_usage_limit renderer', () => {
  it('renders percent and limit type', () => {
    const r: Receipt = {
      user_id: 'u', event_id: 'e', delivered_at: null, read_at: null,
      event: {
        id: 'e', organization_id: 'o', type: 'billing_usage_limit',
        payload: { limit_type: 'pageviews', percent_used: 85 },
        link_url: null, link_label_key: null,
        created_at: '2026-04-15T12:00:00Z', expires_at: '2026-07-14T12:00:00Z',
      },
    }
    const { title, body } = renderNotification(r)
    expect(title).toBe('pageviews at 85%')
    expect(body).toMatch(/85%/)
  })
})

describe('billing_credit_note renderer', () => {
  // Measured on the estate's first ever real refund (03-09-2026). Before iris
  // migration 024 the same event was produced as billing_invoice_sent, so the
  // notification centre showed "Invoice #VF/2026/00029 — EUR €8.47 / Refund
  // subscription" on the day the customer was refunded: an invoice noun, a
  // doubled currency, and the literal plan name "Refund" made into a sentence.
  const creditNote: Receipt = {
    user_id: 'u', event_id: 'e', delivered_at: null, read_at: null,
    event: {
      id: 'e', organization_id: 'o', type: 'billing_credit_note',
      payload: { credit_note_number: 'VF/2026/00029', amount_cents: 847, currency: 'EUR' },
      link_url: null, link_label_key: null,
      created_at: '2026-09-03T13:08:23Z', expires_at: '2026-12-02T13:08:23Z',
    },
  }

  it('leads with the money and the verb, not the document', () => {
    const { title, body, linkLabel } = renderNotification(creditNote)
    expect(title).toBe('Refund processed — €8.47')
    expect(body).toBe('Credit note VF/2026/00029')
    expect(linkLabel).toBe('View billing')
  })

  it('never calls a credit note an invoice, and never says "Refund subscription"', () => {
    const { title, body } = renderNotification(creditNote)
    expect(`${title} ${body}`).not.toMatch(/invoice/i)
    expect(body).not.toMatch(/subscription/i)
  })

  it('prints the currency exactly once', () => {
    // The whole point of taking cents + an ISO code instead of a pre-formatted
    // string: there is no second place for a symbol to come from.
    const { title } = renderNotification(creditNote)
    expect(title).not.toMatch(/EUR/)
    expect(title.match(/€/g)).toHaveLength(1)
  })
})

describe('billing_invoice_sent renderer', () => {
  const invoice = (amount: string): Receipt => ({
    user_id: 'u', event_id: 'e', delivered_at: null, read_at: null,
    event: {
      id: 'e', organization_id: 'o', type: 'billing_invoice_sent',
      payload: { invoice_number: 'CIP-2026-0142', amount, currency: 'EUR', plan_name: 'Pro' },
      link_url: null, link_label_key: null,
      created_at: '2026-09-03T13:08:23Z', expires_at: '2026-12-02T13:08:23Z',
    },
  })

  it('does not print the currency twice when the producer already sent a symbol', () => {
    // odoosync sends fmt.Sprintf("€%.2f", …) while the v1 schema documents a
    // bare decimal, and this renderer prefixed `currency` unconditionally —
    // which is what produced "EUR €8.47" on a real customer's screen.
    const { title } = renderNotification(invoice('€29.00'))
    expect(title).toBe('Invoice #CIP-2026-0142 — €29.00')
    expect(title).not.toMatch(/EUR/)
  })

  it('still labels a bare decimal, which is what the schema documents', () => {
    // A stored event in the documented shape must not lose its currency.
    const { title } = renderNotification(invoice('29.00'))
    expect(title).toBe('Invoice #CIP-2026-0142 — EUR 29.00')
  })
})
