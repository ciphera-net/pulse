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
    expect(body).toMatch(/May 15/)
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
