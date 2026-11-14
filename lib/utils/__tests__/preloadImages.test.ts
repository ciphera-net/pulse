import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { forgetPreloadedImages, preloadImages, preloadedImageCount } from '@/lib/utils/preloadImages'

// jsdom's Image loads nothing, so the class under test is replaced by one that records what was asked of it.
class FakeImage {
  static made: FakeImage[] = []
  decoding = ''
  src = ''
  private listeners: Record<string, Array<() => void>> = {}
  decode = vi.fn(() => (this.src.includes('broken') ? Promise.reject(new Error('decode')) : Promise.resolve()))
  constructor() {
    FakeImage.made.push(this)
  }
  addEventListener(type: string, fn: () => void) {
    ;(this.listeners[type] ??= []).push(fn)
  }
  fire(type: string) {
    for (const fn of this.listeners[type] ?? []) fn()
  }
}

const realImage = window.Image

beforeEach(() => {
  FakeImage.made = []
  forgetPreloadedImages()
  ;(window as unknown as { Image: unknown }).Image = FakeImage
})
afterEach(() => {
  ;(window as unknown as { Image: unknown }).Image = realImage
})

describe('preloadImages', () => {
  it('asks for each picture once and decodes it', () => {
    preloadImages(['/api/favicon?domain=a.example&sz=32', '/api/favicon?domain=b.example&sz=32'])
    preloadImages(['/api/favicon?domain=a.example&sz=32'])
    expect(FakeImage.made.map((i) => i.src)).toEqual(['/api/favicon?domain=a.example&sz=32', '/api/favicon?domain=b.example&sz=32'])
    expect(FakeImage.made.every((i) => i.decode.mock.calls.length === 1)).toBe(true)
    expect(preloadedImageCount()).toBe(2)
  })

  it('skips empty entries, so rows can be mapped straight to their icon address', () => {
    preloadImages([null, undefined, '', '/a.png'])
    expect(FakeImage.made.map((i) => i.src)).toEqual(['/a.png'])
  })

  it('forgets a picture that fails, so a later call tries again', async () => {
    preloadImages(['/broken.png'])
    await Promise.resolve()
    await Promise.resolve()
    expect(preloadedImageCount()).toBe(0)
    preloadImages(['/broken.png'])
    expect(FakeImage.made).toHaveLength(2)
  })

  it('forgets a picture whose request errors', () => {
    preloadImages(['/gone.png'])
    FakeImage.made[0].fire('error')
    expect(preloadedImageCount()).toBe(0)
  })

  it('keeps at most 400 pictures and lets the oldest go first', () => {
    preloadImages(Array.from({ length: 400 }, (_, i) => `/i/${i}.png`))
    // Asking for the first one again makes it the newest.
    preloadImages(['/i/0.png'])
    preloadImages(['/i/400.png'])
    expect(preloadedImageCount()).toBe(400)
    // /i/1.png was the oldest left, so it is the one that had to be asked for again.
    const before = FakeImage.made.length
    preloadImages(['/i/0.png', '/i/1.png'])
    expect(FakeImage.made.length - before).toBe(1)
    expect(FakeImage.made.at(-1)?.src).toBe('/i/1.png')
  })
})
