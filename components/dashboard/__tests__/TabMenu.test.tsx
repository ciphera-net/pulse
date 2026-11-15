import React, { useRef, useState } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { TabMenu, TabMenuLabel, placeTabMenu } from '@/components/dashboard/TabMenu'

// The tab that is also a menu (the new dashboard frame's Campaigns tab). The Sources block's own tests
// (frame-blocks.test.tsx) cover it wired to the Switcher; this file pins the menu by itself: where it goes, the
// keyboard, and every way it closes.

describe('placeTabMenu: under the tab, inside the window', () => {
  const menu = { width: 176, height: 180 }
  const viewport = { width: 1280, height: 800 }

  it('hangs under the tab, its left edge on the tab\'s, 6 px below', () => {
    expect(placeTabMenu({ left: 100, top: 200, bottom: 232 }, menu, viewport)).toEqual({ left: 100, top: 238 })
  })

  it('is pushed in from the right edge, and from the left one, by 8 px', () => {
    expect(placeTabMenu({ left: 1200, top: 200, bottom: 232 }, menu, viewport).left).toBe(1280 - 176 - 8)
    expect(placeTabMenu({ left: 2, top: 200, bottom: 232 }, menu, viewport).left).toBe(8)
  })

  it('goes above the tab when there is no room under it', () => {
    expect(placeTabMenu({ left: 100, top: 700, bottom: 732 }, menu, viewport)).toEqual({ left: 100, top: 700 - 6 - 180 })
  })

  it('stays under the tab when it fits on neither side (the top of a menu is the part that must be seen)', () => {
    expect(placeTabMenu({ left: 100, top: 100, bottom: 132 }, menu, { width: 1280, height: 250 }).top).toBe(138)
  })

  it('just fits: the last pixel under the tab counts as room', () => {
    // 232 + 6 + 180 = 418, and the window ends 8 px later.
    expect(placeTabMenu({ left: 100, top: 200, bottom: 232 }, menu, { width: 1280, height: 426 }).top).toBe(238)
    expect(placeTabMenu({ left: 100, top: 200, bottom: 232 }, menu, { width: 1280, height: 425 }).top).toBe(200 - 6 - 180)
  })
})

describe('TabMenuLabel: the tab says which view is open', () => {
  const ref = { current: null }

  it('is the name alone until the tab is chosen', () => {
    const { container } = render(<TabMenuLabel name="Campaigns" choice="Source" selected={false} open={false} labelRef={ref} />)
    expect(container.textContent).toBe('Campaigns')
    expect(container.querySelector('svg')).toBeNull()
  })

  it('adds the open view and a caret once chosen, and tells a screen reader what a second press does', () => {
    const { container } = render(<TabMenuLabel name="Campaigns" choice="Medium" selected open={false} labelRef={ref} />)
    expect(container.textContent).toContain('Campaigns')
    expect(container.textContent).toContain('Medium')
    expect(container.querySelector('.sr-only')?.textContent).toBe(', press again to choose another view')
    const caret = container.querySelector('svg') as SVGElement
    expect(caret.getAttribute('aria-hidden')).toBe('true')
    expect(caret.getAttribute('class')).not.toContain('rotate-180')
  })

  it('turns the caret while the menu is open', () => {
    const { container } = render(<TabMenuLabel name="Campaigns" choice="Medium" selected open labelRef={ref} />)
    expect(container.querySelector('svg')?.getAttribute('class')).toContain('rotate-180')
  })
})

const OPTIONS = [
  { value: 'source', label: 'Source' },
  { value: 'medium', label: 'Medium' },
  { value: 'campaign', label: 'Campaign' },
] as const
type Value = (typeof OPTIONS)[number]['value']

function Harness({ onChange = () => {}, onClose = () => {}, glass }: { onChange?: (v: Value) => void; onClose?: () => void; glass?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(true)
  const [value, setValue] = useState<Value>('medium')
  return (
    <div>
      <button type="button" role="radio" aria-checked="true" data-testid="tab">
        <span ref={ref}>Campaigns</span>
      </button>
      <button type="button" data-testid="elsewhere">Elsewhere</button>
      <TabMenu
        open={open}
        anchorRef={ref}
        label="Campaign dimension"
        options={OPTIONS}
        value={value}
        onChange={(v) => { setValue(v); onChange(v) }}
        onClose={() => { setOpen(false); onClose() }}
        glass={glass}
      />
    </div>
  )
}
const items = () => within(screen.getByRole('menu')).getAllByRole('menuitemradio')

describe('TabMenu: the menu', () => {
  it('is a menu of radio items with the open view ticked and focused', () => {
    render(<Harness />)
    expect(screen.getByRole('menu', { name: 'Campaign dimension' })).toBeTruthy()
    expect(items().map((i) => [i.textContent, i.getAttribute('aria-checked')])).toEqual([['Source', 'false'], ['Medium', 'true'], ['Campaign', 'false']])
    expect(document.activeElement).toBe(items()[1])
    // The tick is drawn for the open view alone; the others keep its room so the labels stay in one column.
    const ticks = items().map((i) => i.querySelector('svg')?.getAttribute('class') ?? '')
    expect(ticks[1]).toContain('opacity-100')
    expect(ticks[0]).toContain('opacity-0')
  })

  it('is drawn in the body (a portal), outside whatever holds the tab, and is glass unless told otherwise', () => {
    const { container, unmount } = render(<Harness />)
    const menu = screen.getByRole('menu')
    expect(container.contains(menu)).toBe(false)
    expect(menu.parentElement).toBe(document.body)
    expect(menu.className).toContain('glass-panel')
    expect(menu.className).not.toContain('bg-popover')
    unmount()
    render(<Harness glass={false} />)
    expect(screen.getByRole('menu').className).toContain('bg-popover border border-border')
  })

  it('moves with the arrow keys, round the ends, and with Home and End', () => {
    render(<Harness />)
    const menu = screen.getByRole('menu')
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(items()[2])
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(items()[0])
    fireEvent.keyDown(menu, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(items()[2])
    fireEvent.keyDown(menu, { key: 'Home' })
    expect(document.activeElement).toBe(items()[0])
    fireEvent.keyDown(menu, { key: 'End' })
    expect(document.activeElement).toBe(items()[2])
  })

  it('choosing a view reports it, closes the menu and hands the focus back to the tab', () => {
    const onChange = vi.fn()
    const onClose = vi.fn()
    render(<Harness onChange={onChange} onClose={onClose} />)
    fireEvent.click(items()[2])
    expect(onChange).toHaveBeenCalledWith('campaign')
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(screen.getByTestId('tab'))
  })

  it.each([['Escape'], ['Tab']])('%s closes it and hands the focus back to the tab, choosing nothing', (key) => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    fireEvent.keyDown(screen.getByRole('menu'), { key })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(screen.getByTestId('tab'))
  })

  it('a press anywhere else closes it', () => {
    render(<Harness />)
    fireEvent.pointerDown(screen.getByTestId('elsewhere'))
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('a press on the tab itself does NOT close it here: the tab\'s own click toggles it', () => {
    // Closing on the press as well would close it and let the click open it again.
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    fireEvent.pointerDown(screen.getByTestId('tab'))
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('menu')).toBeTruthy()
  })

  it('a press inside it does not close it', () => {
    render(<Harness />)
    fireEvent.pointerDown(items()[0])
    expect(screen.getByRole('menu')).toBeTruthy()
  })

  it('closes when the page moves its tab, and when the window changes size', () => {
    const { unmount } = render(<Harness />)
    // The page scrolls 40 px: the tab is somewhere else than where the menu was placed from.
    const tab = screen.getByTestId('tab')
    tab.getBoundingClientRect = () => ({ left: 0, top: -40, right: 0, bottom: -40, width: 0, height: 0, x: 0, y: -40, toJSON: () => ({}) })
    fireEvent.scroll(document)
    expect(screen.queryByRole('menu')).toBeNull()
    unmount()

    render(<Harness />)
    fireEvent(window, new Event('resize'))
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('stays open through a scroll that leaves its tab where it was', () => {
    // Another list scrolling, the menu's own, or the late event of a scroll that ended before the press (a tab row
    // bringing its tab into view on a phone, which closed the menu in the frame it opened).
    render(<Harness />)
    fireEvent.scroll(document)
    fireEvent.scroll(screen.getByTestId('elsewhere'))
    fireEvent.scroll(screen.getByRole('menu'))
    expect(screen.getByRole('menu')).toBeTruthy()
  })

  it('is placed before it is seen: on the first render it has a real position, never the off-screen one', () => {
    render(<Harness />)
    const menu = screen.getByRole('menu')
    // jsdom measures every box as 0 x 0 at 0, 0: under a tab at the origin the menu sits 6 px down, 8 px in.
    expect(menu.style.left).toBe('8px')
    expect(menu.style.top).toBe('6px')
    expect(menu.style.width).toBe('176px')
  })

  it('renders nothing while closed', () => {
    function Closed() {
      const ref = useRef<HTMLSpanElement>(null)
      return <TabMenu open={false} anchorRef={ref} label="Campaign dimension" options={OPTIONS} value="source" onChange={() => {}} onClose={() => {}} />
    }
    render(<Closed />)
    expect(screen.queryByRole('menu')).toBeNull()
  })
})
