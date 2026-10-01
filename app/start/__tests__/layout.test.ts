import { describe, it, expect } from 'vitest'
import { metadata } from '../layout'

describe('/start/* is never indexed', () => {
  it('declares noindex, nofollow', () => {
    expect(metadata.robots).toEqual({ index: false, follow: false })
  })
})
