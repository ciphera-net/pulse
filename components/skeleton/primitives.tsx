'use client'

import { createElement, useEffect, useRef, type CSSProperties, type HTMLAttributes } from 'react'
import { registerBar } from '@/lib/skeleton/band'

// ---------------------------------------------------------------------------
// The pieces every skeleton in Pulse is made of.
//
// A piece is ONE element with the class `skeleton`: the stylesheet textures every `.skeleton` with the dither
// (lib/skeleton/dither.ts, styles/globals.css) and lib/skeleton/band.ts sweeps the orange band across it. This was
// the new look of the new dashboard's beta; it is every reader's since 15-11-2026.
//
// So a placeholder drawn anywhere in the app goes through one of these, never a bare <div> with a gray fill: a bare
// one would stay a flat gray box among the dithered pieces.
// ---------------------------------------------------------------------------

/** On every skeleton bar: the class the stylesheet textures. */
export const SKELETON_BAR_CLASS = 'skeleton'

/** The bar's own fill under the texture, and the fade it arrives with. */
const BAR = 'animate-skeleton-fade bg-neutral-800'

/**
 * A skeleton piece's element: it tells the band's animator that it is on the page and when it leaves. That is
 * all the script a piece has; what it looks like is the stylesheet's.
 */
export function useSkeletonBar<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null)
  useEffect(() => (ref.current ? registerBar(ref.current) : undefined), [])
  return ref
}

interface PieceProps {
  className?: string
  /** For a size the classes cannot say (a share of the row, a measured width). */
  style?: CSSProperties
}

export function SkeletonLine({ className = '', style }: PieceProps) {
  const ref = useSkeletonBar()
  return <div ref={ref} className={`${SKELETON_BAR_CLASS} ${BAR} rounded-none ${className}`} style={style} />
}

export function SkeletonCircle({ className = '', style }: PieceProps) {
  const ref = useSkeletonBar()
  return <div ref={ref} className={`${SKELETON_BAR_CLASS} ${BAR} rounded-full ${className}`} style={style} />
}

export function SkeletonCard({ className = '', style }: PieceProps) {
  const ref = useSkeletonBar()
  return <div ref={ref} className={`${SKELETON_BAR_CLASS} ${BAR} rounded-none ${className}`} style={style} />
}

interface SkeletonBarProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  /** `span` where the bar stands in for a line of text inside a paragraph or a label. */
  as?: 'div' | 'span'
}

/**
 * A placeholder that keeps its OWN classes: for the loading states drawn by hand around the app (a settings row's
 * `bg-input` bars, the visitors list's pulsing rows). It takes the dither like every other piece; its own classes
 * still give its size and shape.
 */
export function SkeletonBar({ as = 'div', className = '', ...rest }: SkeletonBarProps) {
  const ref = useSkeletonBar<HTMLElement>()
  return createElement(as, { ...rest, ref, className: `${SKELETON_BAR_CLASS} ${className}` })
}
