import { describe, it, expect } from 'vitest'
import { pctChange, guardedPctChange } from '../pctChange'

describe('pctChange', () => {
  it('returns null when both are zero', () => {
    expect(pctChange(0, 0)).toBeNull()
  })

  it('returns "new" when previous is zero and current is not', () => {
    expect(pctChange(5, 0)).toEqual({ type: 'new' })
  })

  it('computes rounded percentage change', () => {
    expect(pctChange(150, 100)).toEqual({ type: 'pct', value: 50 })
    expect(pctChange(50, 100)).toEqual({ type: 'pct', value: -50 })
    expect(pctChange(101, 300)).toEqual({ type: 'pct', value: -66 })
  })
})

describe('guardedPctChange', () => {
  it('suppresses the badge below the minimum base', () => {
    // 1 → 3 visitors is "↑200%" — noise, not signal
    expect(guardedPctChange(3, 1, 1)).toBeNull()
    expect(guardedPctChange(90, 9, 9)).toBeNull()
  })

  it('passes through at or above the minimum base', () => {
    expect(guardedPctChange(20, 10, 10)).toEqual({ type: 'pct', value: 100 })
    expect(guardedPctChange(50, 100, 100)).toEqual({ type: 'pct', value: -50 })
  })

  it('suppresses "new" badges on an insufficient base', () => {
    // previous metric 0 but the whole window had < minBase visitors
    expect(guardedPctChange(5, 0, 3)).toBeNull()
  })

  it('respects a custom minimum base', () => {
    expect(guardedPctChange(3, 1, 5, 5)).toEqual({ type: 'pct', value: 200 })
    expect(guardedPctChange(3, 1, 4, 5)).toBeNull()
  })

  it('still returns null when both values are zero on a big base', () => {
    expect(guardedPctChange(0, 0, 100)).toBeNull()
  })
})
