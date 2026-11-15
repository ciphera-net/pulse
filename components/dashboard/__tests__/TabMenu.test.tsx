import React, { useRef, useState } from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { TabMenu, TabMenuLabel, placeTabMenu } from '@/components/dashboard/TabMenu'

// The menu enters and leaves as the date menu does (framer-motion). The shared stand-in draws motion elements as
// plain ones and lets a closing menu go at once, as the date picker's own tests do; the entrance itself is pinned
// below against the date menu's source, so the two cannot drift apart.
vi.mock('framer-motion', () => import('@/components/settings/__tests__/framer-mock'))

// The tab that is also a menu (the new dashboard frame's Campaigns tab). The Sources block's own tests
// (frame-blocks.test.tsx) cover it wired to the Switcher; this file pins the menu by itself: where it goes, the
// keyboard, and every way it closes.

describe('placeTabMenu: under the tab, inside the window', () => {
  const menu = { width: 176, height: 180 }
  const viewport = { width: 1280, height: 800 }

  it('hangs under the tab from its caret: its right edge on the tab\'s, 6 px below', () => {
    expect(placeTabMenu({ right: 400, top: 200, bottom: 232 }, menu, viewport)).toEqual({ left: 400 - 176, top: 238 })
  })

  it('is pushed in from the right edge, and from the left one, by 8 px', () => {
    expect(placeTabMenu({ right: 1279, top: 200, bottom: 232 }, menu, viewport).left).toBe(1280 - 176 - 8)
    // A tab whose right end is nearer the left edge than the menu is wide (a phone's first tab).
    expect(placeTabMenu({ right: 90, top: 200, bottom: 232 }, menu, viewport).left).toBe(8)
  })

  it('goes above the tab when there is no room under it', () => {
    expect(placeTabMenu({ right: 400, top: 700, bottom: 732 }, menu, viewport)).toEqual({ left: 400 - 176, top: 700 - 6 - 180 })
  })

  it('stays under the tab when it fits on neither side (the top of a menu is the part that must be seen)', () => {
    expect(placeTabMenu({ right: 400, top: 100, bottom: 132 }, menu, { width: 1280, height: 250 }).top).toBe(138)
  })

  it('just fits: the last pixel under the tab counts as room', () => {
    // 232 + 6 + 180 = 418, and the window ends 8 px later.
    expect(placeTabMenu({ right: 400, top: 200, bottom: 232 }, menu, { width: 1280, height: 426 }).top).toBe(238)
    expect(placeTabMenu({ right: 400, top: 200, bottom: 232 }, menu, { width: 1280, height: 425 }).top).toBe(200 - 6 - 180)
  })
})

describe('TabMenuLabel: the tab is the open view, with the caret in a part of its own', () => {
  const ref = { current: null }
  const noop = () => {}
  const label = (props: Partial<React.ComponentProps<typeof TabMenuLabel>> = {}) => (
    <TabMenuLabel name="Campaigns" choice="Medium" selected={false} open={false} labelRef={ref} onCaretPress={noop} {...props} />
  )
  /** What is on screen: the words kept for a screen reader left out. */
  const seen = (container: HTMLElement) => {
    const copy = container.cloneNode(true) as HTMLElement
    copy.querySelectorAll('.sr-only').forEach((n) => n.remove())
    return copy.textContent
  }
  const namePart = (container: HTMLElement) => container.querySelector('[data-tab-menu-name]') as HTMLElement
  const caretPart = (container: HTMLElement) => container.querySelector('[data-tab-menu-caret]') as HTMLElement
  const classes = (el: Element) => new Set((el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean))

  it.each([[false], [true]])('reads the view ALONE on every state, never the tab\'s own name (chosen: %s)', (selected) => {
    const { container } = render(label({ selected }))
    // Not "Campaigns", and not "Campaigns · Medium": the tab IS the view last picked, whichever tab is open.
    expect(seen(container)).toBe('Medium')
  })

  it('tells a screen reader the tab\'s name before the view\'s on every state, and on the chosen tab what a second press does', () => {
    const unchosen = render(label())
    expect(unchosen.container.textContent).toBe('Campaigns: Medium')
    unchosen.unmount()
    const chosen = render(label({ selected: true }))
    expect(chosen.container.textContent).toBe('Campaigns: Medium, press again to choose another view')
    expect([...chosen.container.querySelectorAll('.sr-only')].map((n) => n.textContent)).toEqual(['Campaigns: ', ', press again to choose another view'])
  })

  it.each([[false], [true]])('has its caret on every state, hidden from a screen reader (chosen: %s)', (selected) => {
    const { container } = render(label({ selected }))
    const icon = caretPart(container).querySelector('svg') as SVGElement
    expect(icon.getAttribute('aria-hidden')).toBe('true')
    expect(icon.getAttribute('class')).not.toContain('rotate-180')
    // One caret, in the caret's part and nowhere else.
    expect(container.querySelectorAll('svg')).toHaveLength(1)
    expect(namePart(container).querySelector('svg')).toBeNull()
  })

  it('turns the caret while the menu is open', () => {
    const { container } = render(label({ selected: true, open: true }))
    expect(container.querySelector('svg')?.getAttribute('class')).toContain('rotate-180')
  })

  it('fits its two parts to the Switcher\'s small segment, so together they cover the tab', () => {
    // jsdom lays nothing out. Measured on the page: a tab of 87.75 x 28 px, the name's part from its left edge to
    // the hairline, the caret's 27 px from the hairline to its right edge, both as tall as the tab.
    const { container } = render(label())
    const name = classes(namePart(container))
    const caret = classes(caretPart(container))
    for (const part of [name, caret]) {
      // The segment's 28 px, over its 1 px border on both sides.
      expect(part.has('h-7')).toBe(true)
      expect(part.has('-my-px')).toBe(true)
    }
    // Over the segment's 10 px of padding and 1 px of border, on its own side.
    expect(name.has('-ms-[11px]')).toBe(true)
    expect(name.has('ps-[11px]')).toBe(true)
    expect(caret.has('-me-[11px]')).toBe(true)
    // Nothing between the two parts: the air before the hairline is the name's own padding, not a margin.
    expect(name.has('pe-2.5')).toBe(true)
    expect([...name, ...caret].some((c) => /^-?m[sexy]?-/.test(c) && !['-my-px', '-ms-[11px]', '-me-[11px]'].includes(c))).toBe(false)
    expect(caret.has('w-[27px]')).toBe(true)
    expect(caret.has('border-s')).toBe(true)
  })

  it('draws the hairline dark on the chosen tab\'s orange and as the frame\'s own on the track', () => {
    const unchosen = render(label())
    expect(classes(caretPart(unchosen.container)).has('border-white/[0.08]')).toBe(true)
    expect(classes(caretPart(unchosen.container)).has('border-black/20')).toBe(false)
    unchosen.unmount()
    const chosen = render(label({ selected: true }))
    expect(classes(caretPart(chosen.container)).has('border-black/20')).toBe(true)
    expect(classes(caretPart(chosen.container)).has('border-white/[0.08]')).toBe(false)
  })

  it.each([[false], [true]])('a press on the caret is the caret\'s alone: it is reported once and never reaches the tab (chosen: %s)', (selected) => {
    const onTab = vi.fn()
    const onCaretPress = vi.fn()
    const { container } = render(<button type="button" role="radio" aria-checked={selected} onClick={onTab}>{label({ selected, onCaretPress })}</button>)
    fireEvent.click(caretPart(container))
    expect(onCaretPress).toHaveBeenCalledTimes(1)
    expect(onTab).not.toHaveBeenCalled()
    // The icon is inside the part: a press on it is the same press.
    fireEvent.click(caretPart(container).querySelector('svg') as SVGElement)
    expect(onCaretPress).toHaveBeenCalledTimes(2)
    expect(onTab).not.toHaveBeenCalled()
  })

  it('a press on the name reaches the tab until the tab is chosen, and stops at the name once it is', () => {
    const onTab = vi.fn()
    const onCaretPress = vi.fn()
    const unchosen = render(<button type="button" role="radio" aria-checked={false} onClick={onTab}>{label({ onCaretPress })}</button>)
    fireEvent.click(namePart(unchosen.container))
    expect(onTab).toHaveBeenCalledTimes(1)
    unchosen.unmount()

    onTab.mockClear()
    const chosen = render(<button type="button" role="radio" aria-checked onClick={onTab}>{label({ selected: true, onCaretPress })}</button>)
    fireEvent.click(namePart(chosen.container))
    // Nothing left to choose, and the name opens no list.
    expect(onTab).not.toHaveBeenCalled()
    expect(onCaretPress).not.toHaveBeenCalled()
    // The keyboard's press is on the button itself and is the tab's to hear.
    fireEvent.click(chosen.container.querySelector('button') as HTMLButtonElement)
    expect(onTab).toHaveBeenCalledTimes(1)
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
        <span ref={ref}>
          <span data-tab-menu-name="" data-testid="name">Medium</span>
          <span data-tab-menu-caret="" data-testid="caret"><svg data-testid="caret-icon" /></span>
        </span>
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

  it.each([['caret'], ['caret-icon']])('a press on the %s does NOT close it here: the caret\'s own click closes it', (part) => {
    // Closing on the press as well would close it and let the click open it again.
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    fireEvent.pointerDown(screen.getByTestId(part))
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('menu')).toBeTruthy()
  })

  it('a press on the tab that lands on neither part is the tab\'s own too, and does not close it here', () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    fireEvent.pointerDown(screen.getByTestId('tab'))
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('menu')).toBeTruthy()
  })

  it('a press on the name closes it, as a press anywhere else does: the name opens and closes nothing', () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    fireEvent.pointerDown(screen.getByTestId('name'))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
    // The focus is not pulled anywhere: the press itself puts it on the tab.
    expect(document.activeElement).not.toBe(screen.getByTestId('elsewhere'))
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
    expect(menu.style.minWidth).toBe('176px')
  })

  it('is as wide as its longest name and never wraps a row: at least the date list\'s 176 px, at most 320 px', () => {
    // "Journal to newsletter" wrapped onto two lines in the first build's fixed 176 px (15-11-2026).
    render(<Harness />)
    const menu = screen.getByRole('menu')
    expect(menu.style.width).toBe('max-content')
    expect(menu.style.minWidth).toBe('176px')
    expect(menu.style.maxWidth).toBe('320px')
    for (const item of items()) {
      expect(item.className).toContain('whitespace-nowrap')
      // A name past the widest the menu goes is cut with an ellipsis, and said in full on the row.
      const label = item.querySelector('span')
      expect(label?.className).toContain('truncate')
      expect(item.getAttribute('title')).toBe(label?.textContent)
    }
  })

  it('enters and leaves exactly as the date menu does (R48: the same animation everywhere)', () => {
    const root = process.cwd()
    // The menu's own motion element: from its `initial={{`, the four literals that follow (the date picker's calendar
    // has a transition of its own EARLIER in the file, so nothing is read from before that point).
    const motionOf = (rel: string) => {
      const src = readFileSync(join(root, rel), 'utf8')
      const block = src.slice(src.indexOf('initial={{'))
      const pick = (prop: string) => block.match(new RegExp(`${prop}=\\{\\{([^}]*)\\}\\}`))?.[1].replace(/\s+/g, ' ').trim()
      return { initial: pick('initial'), animate: pick('animate'), exit: pick('exit'), transition: pick('transition') }
    }
    const date = motionOf('components/ui/DateRangePicker.tsx')
    expect(date.initial).toBe('opacity: 0, y: 4, scale: 0.98')
    expect(motionOf('components/dashboard/TabMenu.tsx')).toEqual(date)
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
