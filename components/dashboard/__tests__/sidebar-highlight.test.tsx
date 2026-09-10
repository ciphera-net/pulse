// The sidebar's selection highlight is ONE block owned by the nav, which glides
// to the item you pick (owner, 10-09-2026: "that glow should have an animation
// that it glides to the other item you go to. like the switchers we have on the
// dashboard blocks").
//
// jsdom has no layout — offsetLeft/offsetTop are always 0 — so these tests pin
// the STRUCTURE the glide depends on, and the staging harness measures the
// movement itself. The mutation they kill is the obvious regression: putting the
// background back on the individual links, which would paint a block that jumps
// again while the real one glides underneath.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const source = readFileSync(join(process.cwd(), 'components/dashboard/Sidebar.tsx'), 'utf8')
/** Source with comments stripped, so prose can never satisfy an assertion. */
const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[^\n]*?\/\/[^\n]*$/gm, '')

describe('the sidebar selection highlight', () => {
  it('is drawn ONCE by the nav, not by each link', () => {
    // Exactly one element carries the orange block.
    expect(code.match(/bg-brand-orange\/10/g)?.length ?? 0).toBe(1)
    // ...and it is the nav's highlight, not a link.
    expect(code).toContain('data-sidebar-highlight')
    // 🔴 The regression this exists for: a link painting its own background
    // again. The active branch keeps the INK and nothing else.
    expect(code).toMatch(/\?\s*'text-brand-orange'/)
    expect(code).not.toMatch(/'bg-brand-orange\/10 text-brand-orange'/)
  })

  it('marks the active link so the nav can measure it, in all three link kinds', () => {
    // NavLink, HomeNavLink and HomeSiteLink each opt in — a fourth kind added
    // without the attribute would simply never be highlighted, so pin the count.
    expect(code.match(/data-sidebar-active=\{active \? '' : undefined\}/g)?.length ?? 0).toBe(3)
    expect(code).toContain("querySelector<HTMLElement>('[data-sidebar-active]')")
  })

  it('layers the block under the links', () => {
    // The block is absolute z-0; every link is relative z-10 above it. Without
    // this the block paints over the label and icon.
    expect(code).toMatch(/absolute left-0 top-0 z-0/)
    // All three link kinds, one of which also carries the group/nav marker.
    expect(code.match(/relative z-10 flex items-center gap-2\.5/g)?.length ?? 0).toBe(3)
    expect(code).toMatch(/group\/nav relative z-10 flex items-center/)
  })

  it('glides on transform, and does NOT animate its first placement', () => {
    // The glide itself.
    expect(code).toMatch(/transition-\[transform,width,height,opacity\] duration-base ease-apple/)
    expect(code).toContain('motion-reduce:transition-none')
    // ⚠️ Gated on `settled`: a block sliding in from the corner on every page
    // load is a glitch, not polish. This is the Switcher's own rule.
    expect(code).toMatch(/settled\s*\?\s*'transition-\[transform/)
    expect(code).toContain('requestAnimationFrame(() => setSettled(true))')
  })

  it('follows the pending href, so it starts moving on the click', () => {
    // Not on route commit — the links already paint themselves active
    // optimistically, and the block must agree with them.
    expect(code).toContain('const activeKey = pendingHref ?? pathname')
  })

})
