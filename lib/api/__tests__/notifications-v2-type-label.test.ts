import { describe, it, expect, vi, beforeEach } from 'vitest'

// The one boundary the registry's label crosses on its way to a card
// (PULSE-67): the list response is normalised here, so a key dropped here
// would put the fallback back on its no-label path without anything failing.
const apiRequest = vi.fn()
vi.mock('@/lib/api/client', () => ({ default: (...args: unknown[]) => apiRequest(...args) }))

import { listNotifications } from '../notifications-v2'

const event = {
  id: 'e', organization_id: 'o', type: 'a_type_that_does_not_exist', payload: {},
  created_at: '2026-09-25T12:00:00Z', expires_at: '2026-11-24T12:00:00Z',
}

beforeEach(() => apiRequest.mockReset())

describe('listNotifications: the registry label for a type', () => {
  it('carries type_display_name through to the receipt', async () => {
    apiRequest.mockResolvedValue({ receipts: [{ user_id: 'u', event_id: 'e', type_display_name: 'Something happened', event }], unread_count: 0 })
    const { receipts } = await listNotifications()
    expect(receipts[0].type_display_name).toBe('Something happened')
  })

  it('reads an absent label as null, from a backend that predates it', async () => {
    apiRequest.mockResolvedValue({ receipts: [{ user_id: 'u', event_id: 'e', event }], unread_count: 0 })
    const { receipts } = await listNotifications()
    expect(receipts[0].type_display_name).toBeNull()
  })
})
