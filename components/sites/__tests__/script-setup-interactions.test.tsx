import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ScriptSetupBlock from '@/components/sites/ScriptSetupBlock'

/**
 * Interaction capture in the install panel — option B, owner 11-09-2026: one
 * row turns interactions on, three indented rows then expose the kinds. Since
 * tracker v1.9.0 they are the site's settings and never change the snippet.
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

/** The snippet lives behind the "Show script" disclosure in this state. */
function snippet(container: HTMLElement): string {
  fireEvent.click(screen.getByText('Show script'))
  return container.textContent ?? ''
}

describe('interaction capture rows', () => {
  it('offers the parent row, and hides the three kinds until it is on', () => {
    mount()
    expect(screen.getByText('Interaction capture')).toBeTruthy()
    // A surviving sibling proves the panel is expanded, so the absences below
    // are about the rows rather than about a collapsed panel.
    expect(screen.getByText('Respect Do Not Track')).toBeTruthy()
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

  // * Tracker v1.9.0 (14-11-2026) loads the companion itself when the site's settings turn interactions on, so the
  // * snippet is ONE tag whatever these rows say: switching interactions on asks the owner to paste nothing.
  it('the snippet is one tag whether interactions are on or off', () => {
    // * The code block alone: the panel's own text differs, since the kinds' rows appear.
    const code = (container: HTMLElement) => {
      snippet(container)
      return container.querySelector('pre')?.textContent ?? ''
    }
    const off = mount()
    const offText = code(off.container)
    off.unmount()
    const on = mount({ interactions: true, copy: false })
    const onText = code(on.container)
    expect(onText).toBe(offText)
    expect(onText).toContain('data-domain')
    expect(onText).not.toContain('script.interactions.js')
    expect(onText).not.toMatch(/data-no-/)
  })

  it('switching interactions on reports it for saving and leaves the snippet as it was', () => {
    const onFeaturesChange = vi.fn()
    const { container } = render(
      <ScriptSetupBlock site={{ domain: 'example.com', script_features: {} }} siteId="s1" onFeaturesChange={onFeaturesChange} />,
    )
    fireEvent.click(screen.getByText('Show script'))
    const before = container.querySelector('pre')?.textContent ?? ''
    const row = screen.getByText('Interaction capture').closest('[class*="py-3.5"]')!
    fireEvent.click(row.querySelector('button, input')!)
    expect(onFeaturesChange.mock.lastCall?.[0]).toMatchObject({ interactions: true, clicks: true, copy: true, forms: true })
    expect(container.querySelector('pre')?.textContent).toBe(before)
  })

  it('names the rolling core with no integrity, even for a site that stored sri', () => {
    // The version lock (Subresource Integrity) was removed on 07-11-2026; a stored
    // `sri: true` from before then must not change the snippet.
    const { container } = mount({ interactions: true, sri: true })
    const text = snippet(container)
    expect(text).toContain('src="https://js.ciphera.net/script.js"')
    expect(text).not.toContain('integrity=')
    expect(text).not.toContain('crossorigin=')
  })
})
