import { describe, it, expect, beforeEach } from 'vitest'
import {
  generateRequestId,
  getRequestIdHeader,
  setLastRequestId,
  getLastRequestId,
  clearLastRequestId,
} from '../requestId'

describe('generateRequestId', () => {
  it('returns a string starting with REQ', () => {
    const id = generateRequestId()
    expect(id).toMatch(/^REQ/)
  })

  it('contains a timestamp and random segment separated by underscore', () => {
    const id = generateRequestId()
    const parts = id.replace('REQ', '').split('_')
    expect(parts).toHaveLength(2)
    expect(parts[0].length).toBeGreaterThan(0)
    expect(parts[1].length).toBeGreaterThan(0)
  })

  it('generates unique IDs across calls', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateRequestId()))
    expect(ids.size).toBe(100)
  })
})

describe('getRequestIdHeader', () => {
  it('returns X-Request-ID', () => {
    expect(getRequestIdHeader()).toBe('X-Request-ID')
  })
})

describe('lastRequestId storage', () => {
  beforeEach(() => {
    clearLastRequestId()
  })

  it('returns null when no ID has been set', () => {
    expect(getLastRequestId()).toBeNull()
  })

  it('stores and retrieves a request ID', () => {
    setLastRequestId('REQ123_abc')
    expect(getLastRequestId()).toBe('REQ123_abc')
  })

  it('overwrites previous ID on set', () => {
    setLastRequestId('first')
    setLastRequestId('second')
    expect(getLastRequestId()).toBe('second')
  })

  it('clears the stored ID', () => {
    setLastRequestId('REQ123_abc')
    clearLastRequestId()
    expect(getLastRequestId()).toBeNull()
  })
})
