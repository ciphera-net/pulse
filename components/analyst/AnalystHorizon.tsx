'use client'

import { useId, useLayoutEffect, useRef, type FC } from 'react'
import { cn } from '@/lib/utils'

/**
 * Analyst's horizon (PUL-78, round 6, ruled 10-11-2026: glow A on the welcome, glow 3 during a conversation). The Pulse
 * home hero's planet edge lit from behind, ported shape for shape from pulse-website components/overhaul/Horizon.tsx:
 * the same haze, flare, disc, rim glow, rim and grain, drawn at one pixel per unit, so the planet's radius is 1,800 px.
 *
 * - Welcome (A): the rim crosses 22 px above the question box, so the box and the suggestions sit on the planet, and
 *   the hero's light warms the top right corner. The rim draws once and the glow rises, then breathes.
 * - Conversation (3): the horizon moves into the sticky footer. While Analyst answers, the whole horizon is lit; once
 *   the answer is in, only the lit rim stays, over the footer's solid band.
 *
 * Dark-theme art: the light theme draws none of it (`.an-hz` in styles/globals.css). The motion is CSS (`an-hz-*`),
 * and none of it runs under reduced motion. Each animated layer is an element of its own, so the browser fades or
 * breathes it without repainting the blurs every frame.
 */

/** The scene's box in its own units (the hero's): the planet's centre at x 500, the rim's top at y -70. */
const VB = { x: -1100, y: -1800, w: 3200, h: 3100 }
const R = 1800
const APEX = -70
const CX = 500
const CY = APEX + R
/** How far the haze reaches beyond the rim, fading as it climbs. */
const SPREAD = 1250

/** Where the planet's centre and the rim's top sit inside the scene's box, in px. */
const CENTRE_X = CX - VB.x
const APEX_Y = APEX - VB.y
/** The rim's top above the question box (glow A). */
export const RIM_GAP = 22
/** How far the footer's horizon reaches above the footer: room for the haze to fade out. */
export const FOOTER_REACH = 300

const at = (x: number) => Math.acos((x - CX) / R)
const T0 = -at(VB.x)
const T1 = -at(VB.x + VB.w)
const P0 = [CX + R * Math.cos(T0), CY + R * Math.sin(T0)]
const P1 = [CX + R * Math.cos(T1), CY + R * Math.sin(T1)]
const ARC = `M ${P0[0].toFixed(1)} ${P0[1].toFixed(1)} A ${R} ${R} 0 0 1 ${P1[0].toFixed(1)} ${P1[1].toFixed(1)}`
const K = R / (R + SPREAD)
/** User-space region: the default (the shape's box ±10%) clips a blurred glow into a hard band. */
const REGION = { x: VB.x - 200, y: VB.y - 200, width: VB.w + 400, height: VB.h + 400 }

/**
 * The scene's pieces, back to front: the haze and the flare behind the planet, its disc, the wide rim glow, the near
 * rim glow (a tight one and one inside the disc), the rim itself, and the grain over everything.
 */
type Piece = 'haze' | 'disc' | 'wide' | 'near' | 'rim' | 'grain'

/** One layer of the scene: an SVG the size of the scene's box, drawing only the pieces it is given. */
const SceneLayer: FC<{ pieces: readonly Piece[]; drawRim?: boolean }> = ({ pieces, drawRim = false }) => {
  // * Ids are per layer: every layer carries its own defs, and several layers are on the page at once.
  const p = `an-hz-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const has = (piece: Piece) => pieces.includes(piece)
  const ref = (name: string) => `url(#${p}-${name})`
  return (
    <svg
      aria-hidden="true"
      viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`}
      width={VB.w}
      height={VB.h}
      className="absolute left-0 top-0 block"
    >
      <defs>
        <radialGradient id={`${p}-haze`} gradientUnits="userSpaceOnUse" cx={CX} cy={CY} r={R + SPREAD}>
          <stop offset={K} stopColor="#FD5E0F" stopOpacity="0.6" />
          <stop offset={K + (1 - K) * 0.06} stopColor="#E54E00" stopOpacity="0.32" />
          <stop offset={K + (1 - K) * 0.24} stopColor="#7A2300" stopOpacity="0.13" />
          <stop offset={K + (1 - K) * 0.6} stopColor="#4A1500" stopOpacity="0.06" />
          <stop offset="1" stopColor="#3A1000" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${p}-light`} gradientUnits="userSpaceOnUse" x1={-300} y1={0} x2={2100} y2={0}>
          <stop offset="0" stopColor="white" stopOpacity="0.1" />
          <stop offset="0.45" stopColor="white" stopOpacity="0.36" />
          <stop offset="0.8" stopColor="white" stopOpacity="0.8" />
          <stop offset="1" stopColor="white" stopOpacity="1" />
        </linearGradient>
        <mask id={`${p}-mask`} maskUnits="userSpaceOnUse" {...REGION}>
          <rect x={VB.x} y={VB.y} width={VB.w} height={VB.h} fill={ref('light')} />
        </mask>
        <linearGradient id={`${p}-rim`} gradientUnits="userSpaceOnUse" x1={P0[0]} y1={0} x2={P1[0]} y2={0}>
          <stop offset="0" stopColor="#8A2A00" stopOpacity="0.25" />
          <stop offset="0.45" stopColor="#C2410C" stopOpacity="0.6" />
          <stop offset="0.7" stopColor="#FD5E0F" stopOpacity="0.95" />
          <stop offset="0.86" stopColor="#FFB36B" />
          <stop offset="1" stopColor="#FFF1E0" />
        </linearGradient>
        <radialGradient id={`${p}-disc`} gradientUnits="userSpaceOnUse" cx={CX} cy={CY} r={R}>
          <stop offset="0" stopColor="#040404" />
          <stop offset="0.9" stopColor="#060606" />
          <stop offset="0.975" stopColor="#0B0806" />
          <stop offset="1" stopColor="#1C0D05" />
        </radialGradient>
        <radialGradient id={`${p}-flare`} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#FFC58F" stopOpacity="0.5" />
          <stop offset="0.5" stopColor="#FD5E0F" stopOpacity="0.16" />
          <stop offset="1" stopColor="#FD5E0F" stopOpacity="0" />
        </radialGradient>
        <clipPath id={`${p}-inside`}>
          <circle cx={CX} cy={CY} r={R} />
        </clipPath>
        <filter id={`${p}-b1`} filterUnits="userSpaceOnUse" {...REGION}>
          <feGaussianBlur stdDeviation="9" />
        </filter>
        <filter id={`${p}-b2`} filterUnits="userSpaceOnUse" {...REGION}>
          <feGaussianBlur stdDeviation="38" />
        </filter>
        <filter id={`${p}-grain`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.9 0" />
        </filter>
      </defs>
      {has('haze') && (
        <>
          <circle cx={CX} cy={CY} r={R + SPREAD} fill={ref('haze')} mask={ref('mask')} />
          <ellipse cx={1720} cy={280} rx={440} ry={300} fill={ref('flare')} />
        </>
      )}
      {has('disc') && <circle cx={CX} cy={CY} r={R} fill={ref('disc')} />}
      {has('wide') && (
        <path d={ARC} fill="none" stroke="#FD7A2F" strokeOpacity="0.32" strokeWidth="70" filter={ref('b2')} mask={ref('mask')} />
      )}
      {has('near') && (
        <>
          <path d={ARC} fill="none" stroke="#FD7A2F" strokeOpacity="0.55" strokeWidth="14" filter={ref('b1')} mask={ref('mask')} />
          <g clipPath={ref('inside')}>
            <path d={ARC} fill="none" stroke="#FD5E0F" strokeOpacity="0.2" strokeWidth="46" filter={ref('b1')} mask={ref('mask')} />
          </g>
        </>
      )}
      {has('rim') && (
        <path
          className={drawRim ? 'an-hz-rim' : undefined}
          d={ARC}
          pathLength={1}
          fill="none"
          stroke={ref('rim')}
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      )}
      {has('grain') && <rect x={VB.x} y={VB.y} width={VB.w} height={VB.h} filter={ref('grain')} opacity="0.045" />}
    </svg>
  )
}

/**
 * Runs `place` now, and again whenever something it reads resizes or the thread scrolls. A ResizeObserver reports
 * after layout and before paint, so a moved question box never paints a frame with the rim in its old place.
 */
function useMeasured(place: () => void, watch: () => (Element | null | undefined)[], scroller: () => Element | null | undefined) {
  useLayoutEffect(() => {
    place()
    const ro = new ResizeObserver(() => place())
    for (const el of watch()) if (el) ro.observe(el)
    const sc = scroller()
    sc?.addEventListener('scroll', place, { passive: true })
    return () => {
      ro.disconnect()
      sc?.removeEventListener('scroll', place)
    }
    // * Set up once per mount: the page remounts the thread for a new or reopened chat, and these with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

/** A part of the Analyst page, by its `data-analyst` name, inside the page's root. */
const part = (root: Element | null | undefined, name: string) =>
  root?.querySelector<HTMLElement>(`[data-analyst="${name}"]`) ?? null

/**
 * The welcome's glow (A): a layer behind the thread, from the panel's top edge (`reach` above the page) down, with the
 * rim 22 px above the question box. The box moves (a phone's welcome scrolls; the past chats arrive and re-centre the
 * welcome), so its place is measured, never assumed.
 */
export const WelcomeHorizon: FC<{ reach: number }> = ({ reach }) => {
  const layer = useRef<HTMLDivElement>(null)
  const scene = useRef<HTMLDivElement>(null)
  const root = () => layer.current?.parentElement
  useMeasured(
    () => {
      const composer = part(root(), 'composer')
      if (!layer.current || !scene.current || !composer) return
      const box = layer.current.getBoundingClientRect()
      const c = composer.getBoundingClientRect()
      const x = c.left + c.width / 2 - box.left - CENTRE_X
      const y = c.top - box.top - RIM_GAP - APEX_Y
      scene.current.style.transform = `translate3d(${x}px, ${y}px, 0)`
    },
    () => [layer.current, part(root(), 'welcome'), part(root(), 'footer'), part(root(), 'composer')],
    () => part(root(), 'viewport'),
  )
  return (
    <div
      ref={layer}
      aria-hidden="true"
      data-analyst="horizon"
      className="an-hz pointer-events-none absolute inset-x-0 bottom-0 z-0 overflow-hidden"
      style={{ top: -reach }}
    >
      <div className="an-hz-glow absolute inset-x-0 top-0 h-[560px] bg-[radial-gradient(55%_70%_at_88%_0%,rgba(253,94,15,0.16),rgba(122,35,0,0.06)_48%,transparent_78%)]" />
      <div ref={scene} className="absolute left-0 top-0" style={{ width: VB.w, height: VB.h }}>
        <div className="an-hz-glow absolute inset-0">
          <SceneLayer pieces={['haze']} />
        </div>
        <SceneLayer pieces={['disc']} />
        <div className="an-hz-glow absolute inset-0">
          <SceneLayer pieces={['wide', 'near']} />
        </div>
        <SceneLayer pieces={['rim', 'grain']} drawRim />
      </div>
    </div>
  )
}

/**
 * The conversation's glow (3), inside the sticky footer, over its solid band: the lit rim always, and while Analyst
 * answers (`lit`) the whole horizon, its dark disc behind the question box. The layer spans the thread's viewport,
 * not the column (measured, so nothing scrolls sideways), and its haze fades out as it climbs.
 */
export const FooterHorizon: FC<{ lit: boolean }> = ({ lit }) => {
  const wrap = useRef<HTMLDivElement>(null)
  const scene = useRef<HTMLDivElement>(null)
  const footer = () => wrap.current?.parentElement
  const viewport = () => footer()?.closest<HTMLElement>('[data-analyst="viewport"]')
  useMeasured(
    () => {
      const f = footer()
      const v = viewport()
      const composer = part(f, 'composer')
      if (!wrap.current || !scene.current || !f || !v || !composer) return
      const fb = f.getBoundingClientRect()
      const left = v.getBoundingClientRect().left + v.clientLeft
      wrap.current.style.left = `${left - fb.left}px`
      wrap.current.style.width = `${v.clientWidth}px`
      const c = composer.getBoundingClientRect()
      const x = c.left + c.width / 2 - left - CENTRE_X
      const y = FOOTER_REACH + (c.top - fb.top) - RIM_GAP - APEX_Y
      scene.current.style.transform = `translate3d(${x}px, ${y}px, 0)`
    },
    () => [viewport(), footer(), part(footer(), 'composer')],
    () => null,
  )
  return (
    <div
      ref={wrap}
      aria-hidden="true"
      data-analyst="horizon"
      data-lit={lit ? 'true' : 'false'}
      className="an-hz an-hz-footer an-hz-in pointer-events-none absolute bottom-0 z-0 overflow-hidden"
      style={{ top: -FOOTER_REACH }}
    >
      <div ref={scene} className="absolute left-0 top-0" style={{ width: VB.w, height: VB.h }}>
        <div
          className={cn(
            'absolute inset-0 transition-opacity duration-700 ease-out motion-reduce:transition-none',
            lit ? 'opacity-100' : 'opacity-0',
          )}
        >
          <SceneLayer pieces={['haze', 'disc', 'wide', 'grain']} />
        </div>
        <SceneLayer pieces={['near', 'rim']} />
      </div>
    </div>
  )
}
