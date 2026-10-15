import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ScriptSetupBlock from '@/components/sites/ScriptSetupBlock'

/**
 * Interaction capture in the install panel — option B, owner 11-09-2026: one
 * row turns the companion tag on, three indented rows then expose the kinds.
 *
 * An active install with a siteId renders the customize panel EXPANDED, which
 * is what makes every absence assertion below non-vacuous — on a collapsed
 * panel no row is present and the tests would pass against any code.
 */
vi.mock('@/lib/swr/dashboard', () => ({
  useInstallStatus: () => ({ data: { install_status: 'active' }, isLoading: false }),
}))

function mount(features: Record<string, unknown> = {}) {
  return render(
    <ScriptSetupBlock site={{ domain: 'example.com', script_features: features }} siteId="s1" />,
  )
}

/** The snippet lives behind the "Show snippet" disclosure in this state. */
function snippet(container: HTMLElement): string {
  fireEvent.click(screen.getByText('Show snippet'))
  return container.textContent ?? ''
}

describe('interaction capture rows', () => {
  it('offers the parent row, and hides the three kinds until it is on', () => {
    mount()
    expect(screen.getByText('Interaction capture')).toBeTruthy()
    // A surviving sibling proves the panel is expanded, so the absences below
    // are about the rows rather than about a collapsed panel.
    expect(screen.getByText(/Subresource Integrity/i)).toBeTruthy()
    for (const k of ['Clicks', 'Copies', 'Form submits']) {
      expect(screen.queryByText(k), `${k} must be hidden while the parent is off`).toBeNull()
    }
  })

  it('reveals the three kinds when the parent is switched on', () => {
    mount()
    // ⚠️ Walk up to the ROW, not to the label's own cell. PanelRow is a grid:
    // the label and the control are SIBLING cells, so `closest('div')` from the
    // label lands on `div.min-w-0`, which holds no control — that is how the
    // first version of this test failed with "please provide a DOM element".
    // Anchored on the row's padding class rather than on Toggle's internals,
    // which carry aria-checked but no role="switch".
    const row = screen.getByText('Interaction capture').closest('[class*="py-3.5"]')!
    fireEvent.click(row.querySelector('button, input')!)
    for (const k of ['Clicks', 'Copies', 'Form submits']) {
      expect(screen.getByText(k), `${k} must appear`).toBeTruthy()
    }
  })

  it('starts with the kinds revealed for a site that already opted in', () => {
    mount({ interactions: true })
    for (const k of ['Clicks', 'Copies', 'Form submits']) {
      expect(screen.getByText(k)).toBeTruthy()
    }
  })

  it('indents each kind on every line and gives it the parent rows’ width', () => {
    // An INLINE span with pl-5 indented only a caption’s first line: a
    // wrapped second line fell back to the row edge. And a fixed 220px label
    // column made these three wrap at half the width of the rows above.
    mount({ interactions: true })
    for (const k of ['Clicks', 'Copies', 'Form submits']) {
      const label = screen.getByText(k)
      expect(label.className).toContain('block')
      expect(label.className).toContain('pl-5')
      const row = label.closest('div[class*="grid"]') as HTMLElement
      expect(row.className).not.toContain('220px')
      const caption = [...row.querySelectorAll('span.pl-5')].find((s) => s !== label)!
      expect(caption.className).toContain('block')
    }
  })

  it('emits ONE tag while the companion is off', () => {
    const { container } = mount()
    const text = snippet(container)
    expect(text).toContain('data-domain')
    expect(text, 'no companion tag until a site opts in').not.toContain('script.interactions.js')
  })

  it('emits BOTH tags once the companion is on', () => {
    const { container } = mount({ interactions: true })
    const text = snippet(container)
    expect(text).toContain('script.js')
    expect(text).toContain('script.interactions.js')
    // 🔴 The companion reads nothing of its own: exactly one data-domain, the core's.
    expect((text.match(/data-domain/g) ?? []).length).toBe(1)
  })

  it('writes a kind’s opt-out only when that kind is off', () => {
    const on = mount({ interactions: true })
    expect(snippet(on.container), 'all kinds on ⇒ no opt-outs').not.toContain('data-no-copy')
    on.unmount()

    const off = mount({ interactions: true, copy: false })
    const text = snippet(off.container)
    expect(text).toContain('data-no-copy')
    expect(text, 'only the kind that is off').not.toContain('data-no-clicks')
    expect(text, 'only the kind that is off').not.toContain('data-no-forms')
  })

  it('does not write a companion opt-out while the companion itself is off', () => {
    // A site that switched copies off, then switched the whole thing off: the
    // kind's state persists, but nothing may be emitted for a tag that is absent.
    const { container } = mount({ interactions: false, copy: false })
    const text = snippet(container)
    expect(text).not.toContain('script.interactions.js')
    expect(text, 'no flag for a tag that is not there').not.toContain('data-no-copy')
  })

  it('pins the companion with its OWN integrity hash under SRI', () => {
    const { container } = mount({ interactions: true, sri: true })
    const text = snippet(container)
    const hashes = [...text.matchAll(/integrity="([^"]+)"/g)].map((m) => m[1])
    expect(hashes, 'two scripts, two hashes').toHaveLength(2)
    expect(new Set(hashes).size, 'the two hashes must differ').toBe(2)
  })
})
