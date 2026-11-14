// Analyst's memories (PUL-78, 14-11-2026): the calls on /sites/:id/barry/memories, the switch, the first ask's yes and
// Not now, and how a full site's 409 is told apart from every other refusal.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const apiRequest = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  default: apiRequest,
}))

import { ApiError } from '@/lib/api/client'
import {
  ANALYST_MEMORIES_FULL,
  acceptAnalystMemory,
  deleteAnalystMemory,
  getAnalystMemories,
  isAnalystMemoriesFull,
  setAnalystMemoriesEnabled,
  snoozeAnalystMemories,
  updateAnalystMemory,
} from '../analyst'

beforeEach(() => {
  apiRequest.mockReset()
  apiRequest.mockResolvedValue(undefined)
})

describe('the memories calls', () => {
  it('reads the memories and the switch from the site path', async () => {
    const memories = { memories: [], max_memories: 20, max_length: 280, enabled: null, offer_snoozed_until: null }
    apiRequest.mockResolvedValue(memories)
    await expect(getAnalystMemories('s1')).resolves.toBe(memories)
    expect(apiRequest).toHaveBeenCalledWith('/sites/s1/barry/memories')
  })

  it('changes a memory by PATCH on the memory path', async () => {
    await updateAnalystMemory('s1', 'm1', 'Shared Link is our weekly newsletter.')
    expect(apiRequest).toHaveBeenCalledWith('/sites/s1/barry/memories/m1', {
      method: 'PATCH',
      body: JSON.stringify({ body: 'Shared Link is our weekly newsletter.' }),
    })
  })

  it('deletes a memory by DELETE, passing keepalive through for an Undo window cut short', async () => {
    await deleteAnalystMemory('s1', 'm1')
    expect(apiRequest).toHaveBeenLastCalledWith('/sites/s1/barry/memories/m1', { method: 'DELETE', keepalive: undefined })
    await deleteAnalystMemory('s1', 'm1', { keepalive: true })
    expect(apiRequest).toHaveBeenLastCalledWith('/sites/s1/barry/memories/m1', { method: 'DELETE', keepalive: true })
  })

  it('sets the switch by PUT with {"enabled": …}', async () => {
    await setAnalystMemoriesEnabled('s1', false)
    expect(apiRequest).toHaveBeenCalledWith('/sites/s1/barry/memories/settings', {
      method: 'PUT',
      body: JSON.stringify({ enabled: false }),
    })
  })

  it('says yes to the first ask with the offered memory, and Not now with nothing', async () => {
    await acceptAnalystMemory('s1', 'Shared Link is our newsletter.')
    expect(apiRequest).toHaveBeenLastCalledWith('/sites/s1/barry/memories/accept', {
      method: 'POST',
      body: JSON.stringify({ body: 'Shared Link is our newsletter.' }),
    })
    await snoozeAnalystMemories('s1')
    expect(apiRequest).toHaveBeenLastCalledWith('/sites/s1/barry/memories/snooze', { method: 'POST' })
  })
})

describe('isAnalystMemoriesFull', () => {
  it('is true only for the 409 that names a full site', () => {
    expect(isAnalystMemoriesFull(new ApiError('full', 409, { error: 'full', code: ANALYST_MEMORIES_FULL }))).toBe(true)
  })

  it('is false for every other refusal', () => {
    expect(isAnalystMemoriesFull(new ApiError('conflict', 409, { error: 'conflict', code: 'something_else' }))).toBe(false)
    expect(isAnalystMemoriesFull(new ApiError('conflict', 409))).toBe(false)
    expect(isAnalystMemoriesFull(new ApiError('too long', 400, { error: 'A memory is 1 to 280 characters.' }))).toBe(false)
    expect(isAnalystMemoriesFull(new ApiError('forbidden', 403, { code: ANALYST_MEMORIES_FULL }))).toBe(false)
    expect(isAnalystMemoriesFull(new Error('network'))).toBe(false)
    expect(isAnalystMemoriesFull(undefined)).toBe(false)
  })
})
