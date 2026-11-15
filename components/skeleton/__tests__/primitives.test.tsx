import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

const h = vi.hoisted(() => ({ registered: [] as HTMLElement[], left: [] as HTMLElement[] }))
vi.mock('@/lib/skeleton/band', () => ({
  registerBar: (el: HTMLElement) => {
    h.registered.push(el)
    return () => h.left.push(el)
  },
}))

import { SkeletonBar, SkeletonCard, SkeletonCircle, SkeletonLine } from '@/components/skeleton/primitives'

// The pieces every skeleton is made of. One element each, with the class the stylesheet textures in the new look,
// and it tells the band's animator when it arrives and when it leaves. In today's look the class styles nothing:
// what a piece draws is what its other classes say, as before.

beforeEach(() => {
  h.registered = []
  h.left = []
})

describe.each([
  ['SkeletonLine', SkeletonLine, 'rounded-none'],
  ['SkeletonCircle', SkeletonCircle, 'rounded-full'],
  ['SkeletonCard', SkeletonCard, 'rounded-none'],
])('%s', (_name, Piece, corner) => {
  it('is one empty element: the bar class, today\'s fill and fade, its corner, then the caller\'s classes', () => {
    const { container } = render(<Piece className="h-4 w-32" />)
    expect(container.children).toHaveLength(1)
    const el = container.firstElementChild as HTMLElement
    expect(el.tagName).toBe('DIV')
    expect(el.className).toBe(`skeleton animate-skeleton-fade bg-neutral-800 ${corner} h-4 w-32`)
    expect(el.childNodes).toHaveLength(0)
  })

  it('takes a size the classes cannot say', () => {
    const { container } = render(<Piece className="h-8" style={{ width: '62%' }} />)
    expect((container.firstElementChild as HTMLElement).style.width).toBe('62%')
  })

  it('tells the band\'s animator when it arrives and when it leaves', () => {
    const { container, unmount } = render(<Piece />)
    const el = container.firstElementChild as HTMLElement
    expect(h.registered).toEqual([el])
    expect(h.left).toEqual([])
    unmount()
    expect(h.left).toEqual([el])
  })

  it('does not arrive a second time when its parent draws again', () => {
    const { rerender } = render(<Piece className="h-4" />)
    rerender(<Piece className="h-6" />)
    expect(h.registered).toHaveLength(1)
    expect(h.left).toHaveLength(0)
  })
})

describe('SkeletonBar: a placeholder that keeps its own classes', () => {
  it('adds the bar class and nothing else, so today\'s look is exactly what its classes say', () => {
    const { container } = render(<SkeletonBar className="h-3.5 w-24 rounded-none bg-input" />)
    const el = container.firstElementChild as HTMLElement
    expect(el.tagName).toBe('DIV')
    expect(el.className).toBe('skeleton h-3.5 w-24 rounded-none bg-input')
    expect(el.className).not.toContain('bg-neutral-800')
    expect(el.className).not.toContain('animate-skeleton-fade')
  })

  it('is a span where it stands in for a line inside a label, and passes the rest through', () => {
    const { container } = render(<SkeletonBar as="span" aria-hidden="true" className="block h-3 w-24 bg-input" />)
    const el = container.firstElementChild as HTMLElement
    expect(el.tagName).toBe('SPAN')
    expect(el.getAttribute('aria-hidden')).toBe('true')
    expect(el.className).toBe('skeleton block h-3 w-24 bg-input')
  })

  it('tells the band\'s animator like every other piece', () => {
    const { container, unmount } = render(<SkeletonBar className="h-10 animate-pulse bg-neutral-800/50" />)
    expect(h.registered).toEqual([container.firstElementChild])
    unmount()
    expect(h.left).toHaveLength(1)
  })
})
