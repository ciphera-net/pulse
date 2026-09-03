'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { ArrowLeftIcon, ArrowRightIcon } from '@ciphera-net/facet'
import { cdnUrl } from '@/lib/cdn'
import { MacWindow } from '../system/MacWindow'

/**
 * Generic capture slideshow — REAL product captures sliding through the same
 * MacWindow frame every §01 visual uses. A sliding track (not a crossfade)
 * auto-scrolls on an interval; prev/next hairline buttons and progress dashes
 * sit under the window. Pauses on hover/focus; never auto-advances under
 * prefers-reduced-motion (controls still work, the slide just snaps). All
 * slides in a set MUST share identical dimensions so the stage never shifts —
 * capture assets are padded onto uniform canvases at cut time.
 */

export interface CaptureSlide {
  key: string
  label: string
  /** cdnUrl() path of the capture, e.g. '/marketing/panel-countries-sep-2x.png' */
  file: string
}

const INTERVAL_MS = 4000

export function CaptureSlideshow({
  slides,
  width,
  height,
  alt,
}: {
  slides: CaptureSlide[]
  width: number
  height: number
  /** Sentence template — the slide label is appended, e.g. "… — Countries". */
  alt: string
}) {
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  const reduced = useRef(false)

  useEffect(() => {
    reduced.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }, [])

  useEffect(() => {
    if (paused) return
    const id = setInterval(() => {
      if (!reduced.current) setActive((a) => (a + 1) % slides.length)
    }, INTERVAL_MS)
    return () => clearInterval(id)
  }, [paused, slides.length])

  const step = (dir: 1 | -1) => setActive((a) => (a + dir + slides.length) % slides.length)

  return (
    <div
      className="w-full"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <MacWindow>
        <div className="overflow-hidden">
          <div
            className="flex transition-transform duration-500 ease-apple motion-reduce:transition-none"
            style={{ transform: `translateX(-${active * 100}%)` }}
          >
            {slides.map((slide) => (
              <Image
                key={slide.key}
                src={cdnUrl(slide.file)}
                alt={`${alt} — ${slide.label}`}
                width={width}
                height={height}
                unoptimized
                className="block w-full shrink-0"
              />
            ))}
          </div>
        </div>
      </MacWindow>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-1.5" aria-hidden="true">
          {slides.map((slide, i) => (
            <span
              key={slide.key}
              className={`h-1 w-6 rounded-none transition-colors duration-150 motion-reduce:transition-none ${
                i === active ? 'bg-brand-orange' : 'bg-border'
              }`}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label="Previous"
            className="flex h-11 w-11 md:h-9 md:w-9 items-center justify-center rounded-none border border-border bg-card text-muted-foreground transition-colors duration-150 ease-apple hover:bg-neutral-900 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
          >
            <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            aria-label="Next"
            className="flex h-11 w-11 md:h-9 md:w-9 items-center justify-center rounded-none border border-border bg-card text-muted-foreground transition-colors duration-150 ease-apple hover:bg-neutral-900 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
          >
            <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  )
}
