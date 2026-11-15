'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { CaretDown, Check } from '@phosphor-icons/react'
import { panelSurface } from '@/lib/dashboard/frame'

// ---------------------------------------------------------------------------
// A tab that is also a menu (the new dashboard frame, 14-11-2026).
//
// The Sources block's third tab holds five views (the UTM dimensions). Outside the frame they are chosen with a
// Select in the header's right slot, a second control a tab's width away from the tab it belongs to. In the frame
// the tab itself says which view is open ("Campaigns · Source") and a second click on it opens the list.
//
// It needs nothing from Facet's Switcher beyond what it already does: an option's label is a node, the thumb
// follows a label that grows, and a click on the selected option still calls onChange (which is where the caller
// opens this menu). The Switcher's option stays a radio; the menu is announced by the label's own words.
// ---------------------------------------------------------------------------

export interface TabMenuOption<V extends string> {
  value: V
  label: string
}

/**
 * The label of a tab that is also a menu. Unselected it is the tab's name alone; selected it adds the open view
 * and a caret. `labelRef` is what the menu hangs from (it walks up to the tab's own button).
 */
export function TabMenuLabel({
  name,
  choice,
  selected,
  open,
  labelRef,
}: {
  name: string
  choice: string
  selected: boolean
  open: boolean
  labelRef: RefObject<HTMLSpanElement | null>
}) {
  return (
    <span ref={labelRef} className="inline-flex items-center whitespace-nowrap" data-tab-menu-label="">
      {name}
      {selected && (
        <>
          <span aria-hidden="true" className="mx-[5px] opacity-70">·</span>
          {choice}
          {/* Said to a screen reader in words: the Switcher's option is a radio and cannot carry aria-haspopup. */}
          <span className="sr-only">, press again to choose another view</span>
          <CaretDown
            weight="bold"
            aria-hidden="true"
            className={`ms-1.5 h-2.5 w-2.5 shrink-0 transition-transform duration-fast ease-apple ${open ? 'rotate-180' : ''}`}
          />
        </>
      )}
    </span>
  )
}

const WIDTH = 176
const GAP = 6
const EDGE = 8

// The date picker's own rows (components/ui/DateRangePicker.tsx), so this is the app's menu and not a second one.
const ROW = 'flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm transition-colors focus:outline-none focus-visible:bg-accent'
const ROW_ON = `${ROW} text-foreground`
const ROW_OFF = `${ROW} text-muted-foreground hover:text-foreground hover:bg-accent`

/**
 * Where the menu goes: under the tab, its left edge on the tab's; above the tab when there is no room under it;
 * pushed in from the window's edges. Pure, so it can be tested without a layout.
 */
export function placeTabMenu(
  tab: { left: number; top: number; bottom: number },
  menu: { width: number; height: number },
  viewport: { width: number; height: number },
): { left: number; top: number } {
  const left = Math.max(EDGE, Math.min(tab.left, viewport.width - menu.width - EDGE))
  const below = tab.bottom + GAP
  const fitsBelow = below + menu.height <= viewport.height - EDGE
  const above = tab.top - GAP - menu.height
  const top = fitsBelow || above < EDGE ? below : above
  return { left, top }
}

interface TabMenuProps<V extends string> {
  open: boolean
  /** The tab's label (TabMenuLabel's `labelRef`). */
  anchorRef: RefObject<HTMLSpanElement | null>
  /** Names the menu for a screen reader, e.g. "Campaign dimension". */
  label: string
  options: readonly TabMenuOption<V>[]
  value: V
  onChange: (value: V) => void
  onClose: () => void
  /** Glass, as every pop-up in the new frame (lib/dashboard/frame.tsx). */
  glass?: boolean
}

export function TabMenu<V extends string>({ open, anchorRef, label, options, value, onChange, onClose, glass = true }: TabMenuProps<V>) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  /** Where the tab was when the menu was placed: a scroll that leaves it there is not the page moving under the menu. */
  const placedFrom = useRef<{ left: number; top: number } | null>(null)

  const tabButton = useCallback(
    () => anchorRef.current?.closest<HTMLElement>('[role="radio"]') ?? anchorRef.current,
    [anchorRef],
  )

  // Placed ONCE, before the first paint of an opening, from the tab as it is drawn now. Nothing is measured again
  // while it is open: a page that moves under it closes it (below). A position left over from the last opening
  // is replaced here before anything is painted.
  useLayoutEffect(() => {
    if (!open) return
    const tab = tabButton()
    const menu = menuRef.current
    if (!tab || !menu) return
    const t = tab.getBoundingClientRect()
    placedFrom.current = { left: t.left, top: t.top }
    setPos(
      placeTabMenu(
        { left: t.left, top: t.top, bottom: t.bottom },
        { width: menu.offsetWidth || WIDTH, height: menu.offsetHeight },
        { width: document.documentElement.clientWidth, height: window.innerHeight },
      ),
    )
  }, [open, tabButton])

  // The open view takes the focus, so the arrow keys start from it.
  useEffect(() => {
    if (!open || !pos) return
    const checked = menuRef.current?.querySelector<HTMLElement>('[aria-checked="true"]')
    ;(checked ?? menuRef.current?.querySelector<HTMLElement>('[role="menuitemradio"]'))?.focus({ preventScroll: true })
  }, [open, pos])

  const close = useCallback(
    (returnFocus: boolean) => {
      onClose()
      if (returnFocus) tabButton()?.focus({ preventScroll: true })
    },
    [onClose, tabButton],
  )

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null
      if (!target) return
      if (menuRef.current?.contains(target)) return
      // A press on the tab itself is the tab's own business: its click toggles the menu. Closing here as well
      // would close it on the press and open it again on the click.
      if (tabButton()?.contains(target)) return
      close(false)
    }
    // The menu was placed once, from where the tab was. When the page moves the tab, the menu goes: it does not
    // chase it. But a scroll event is not always the tab moving. Another list on the page may be scrolling, and
    // the event of a scroll that happened just BEFORE the press arrives a frame after it (the tab row scrolling
    // its tab into view on a phone: the menu opened and closed in one frame). So the tab is asked where it is.
    const onScroll = () => {
      const from = placedFrom.current
      const tab = tabButton()
      if (!from || !tab) return
      const now = tab.getBoundingClientRect()
      if (Math.abs(now.left - from.left) < 1 && Math.abs(now.top - from.top) < 1) return
      close(false)
    }
    const onResize = () => close(false)
    document.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [open, close, tabButton])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [])]
    const at = items.indexOf(document.activeElement as HTMLElement)
    const go = (index: number) => items[(index + items.length) % items.length]?.focus({ preventScroll: true })
    switch (e.key) {
      case 'Escape':
        e.preventDefault()
        e.stopPropagation()
        close(true)
        break
      case 'ArrowDown':
        e.preventDefault()
        go(at + 1)
        break
      case 'ArrowUp':
        e.preventDefault()
        go(at - 1)
        break
      case 'Home':
        e.preventDefault()
        go(0)
        break
      case 'End':
        e.preventDefault()
        go(items.length - 1)
        break
      case 'Tab':
        // The menu is not a stop on the page's tab order: Tab leaves it and goes on from the tab.
        close(true)
        break
      default:
        break
    }
  }

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={`fixed z-50 flex flex-col overflow-hidden rounded-none py-2 shadow-lg ${panelSurface(glass)}`}
      // Off-screen until the measure before the first paint has placed it: never a frame at 0, 0.
      style={{ width: WIDTH, ...(pos ?? { left: -9999, top: -9999 }) }}
    >
      {options.map((option) => {
        const on = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="menuitemradio"
            aria-checked={on}
            tabIndex={-1}
            className={on ? ROW_ON : ROW_OFF}
            onClick={() => {
              onChange(option.value)
              close(true)
            }}
          >
            <Check weight="bold" aria-hidden="true" className={`h-3.5 w-3.5 shrink-0 ${on ? 'opacity-100' : 'opacity-0'}`} />
            {option.label}
          </button>
        )
      })}
    </div>,
    document.body,
  )
}
