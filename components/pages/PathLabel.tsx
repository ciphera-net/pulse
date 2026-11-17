'use client'

import { useLayoutEffect, useMemo, useRef, useState } from 'react'

// ---------------------------------------------------------------------------
// A page's address where room is short (round 3 of the Pages page, 16-11-2026).
//
// Cut at the end, two pages of one folder read the same: "/bikes/gravel…" twice on a phone, for
// /bikes/gravel/iddefjord-gr and /bikes/gravel/femsjo-gx. The end is what tells them apart, so an address that does
// not fit gives up its middle, then its head, and only then is cut at the end:
//
//   /bikes/gravel/femsjo-gx   →   /bikes/…/femsjo-gx   →   …/femsjo-gx   →   …/femsjo-…
//
// Which form fits is MEASURED, never guessed from a count of letters: every form is laid out unseen and the first
// that fits the room is written.
// ---------------------------------------------------------------------------

/** The forms an address is written in, from whole to shortest. */
export function pathForms(path: string): string[] {
  const trail = path.length > 1 && path.endsWith('/') ? '/' : ''
  const body = trail ? path.slice(0, -1) : path
  const cut = body.lastIndexOf('/')
  if (cut <= 0) return [path]
  const last = body.slice(cut) + trail
  const first = body.indexOf('/', 1)
  const forms = [path]
  if (first > 0 && first < cut) forms.push(`${body.slice(0, first)}/…${last}`)
  forms.push(`…${last}`)
  return forms
}

interface PathLabelProps {
  path: string
  center?: boolean
  /**
   * The label sits in a row beside something else (an icon) and is as wide as its words: its room is then its
   * parent's width less `reserve` px. Without it the label fills its box, and its room is the box.
   */
  reserve?: number
  /** The whole address, for the pointer that rests on a shortened one. */
  title?: string
  className?: string
}

export default function PathLabel({ path, center = false, reserve, title, className = '' }: PathLabelProps) {
  const box = useRef<HTMLSpanElement>(null)
  const forms = useMemo(() => pathForms(path), [path])
  const [form, setForm] = useState(0)
  useLayoutEffect(() => {
    const el = box.current
    const measured = reserve === undefined ? el : el?.parentElement
    if (!el || !measured) return
    const pick = () => {
      const room = (reserve === undefined ? el.clientWidth : measured.clientWidth - reserve) + 0.5
      const probes = el.querySelectorAll<HTMLElement>('[data-path-probe]')
      let i = 0
      while (i < probes.length - 1 && probes[i].offsetWidth > room) i++
      setForm(i)
    }
    pick()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(pick)
    observer.observe(measured)
    return () => observer.disconnect()
  }, [forms, reserve])
  return (
    <span
      ref={box}
      className={`relative min-w-0 truncate ${reserve === undefined ? 'block' : ''} ${center ? 'text-center' : ''} ${className}`}
      data-path-form={form}
      title={title}
    >
      {/* Every form, laid out and never drawn: the first that fits is the one written. */}
      {forms.map((f) => (
        <span key={f} data-path-probe="" aria-hidden="true" className="invisible absolute left-0 top-0 whitespace-nowrap">{f}</span>
      ))}
      {forms[form] ?? path}
    </span>
  )
}
