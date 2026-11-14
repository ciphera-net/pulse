import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ScriptSetupBlock from '@/components/sites/ScriptSetupBlock'

/**
 * Do Not Track / Global Privacy Control toggles (PULSE-164) — two rows at the
 * END of "Customize tracking", their own small list, own polarity: ON means
 * Pulse keeps respecting the browser's signal (the default); OFF counts that
 * visitor anyway. Since tracker v1.9.0 they are the site's settings, saved
 * through onPrivacySignalsChange, and never change the snippet.
 *
 * An active install with a siteId renders the customize panel EXPANDED, which
 * is what makes every absence assertion below non-vacuous — on a collapsed
 * panel no row is present and the tests would pass against any code.
 */
vi.mock('@/lib/swr/dashboard', () => ({
  useInstallStatus: () => ({ data: { install_status: 'active' }, isLoading: false }),
}))

function mount(overrides: Record<string, unknown> = {}, props: Record<string, unknown> = {}) {
  return render(
    <ScriptSetupBlock site={{ domain: 'example.com', ...overrides }} siteId="s1" {...props} />,
  )
}

/**
 * The snippet lives behind the "Show script" disclosure in this state.
 *
 * 🔑 Scoped to the `<pre>` CopyBlock renders the code into — NOT the whole
 * container, so a caption can never satisfy an assertion about the code.
 */
function snippet(container: HTMLElement): string {
  fireEvent.click(screen.getByText('Show script'))
  return container.querySelector('pre')?.textContent ?? ''
}

/**
 * ⚠️ Walk up to the ROW, not to the label's own cell — see
 * script-setup-interactions.test.tsx for why `closest('div')` from the label
 * is the wrong anchor. Anchored on the row's own padding class, not on
 * Toggle's internals.
 */
function toggleRow(label: string) {
  const row = screen.getByText(label).closest('[class*="py-3.5"]')!
  fireEvent.click(row.querySelector('button, input')!)
}

describe('privacy-signal rows', () => {
  // * Wording round 14-11-2026 (W4): the clause "your tag gets data-ignore-dnt / -gpc" went with tracker v1.9.0.
  it('renders both rows with the exact copy', () => {
    mount()
    expect(screen.getByText('Respect Do Not Track')).toBeTruthy()
    expect(
      screen.getByText(
        'Browsers that send Do Not Track are not counted. Turn off to count them.',
      ),
    ).toBeTruthy()
    expect(screen.getByText('Respect Global Privacy Control')).toBeTruthy()
    expect(
      screen.getByText(
        'Browsers that send Global Privacy Control are not counted. GPC is a legal opt-out signal in California and other US states. Turn off to count them.',
      ),
    ).toBeTruthy()
  })

  it('sits after Interaction capture — end of the Customize tracking list', () => {
    const { container } = mount()
    const text = container.textContent ?? ''
    const interactions = text.indexOf('Interaction capture')
    const dnt = text.indexOf('Respect Do Not Track')
    const gpc = text.indexOf('Respect Global Privacy Control')
    expect(interactions).toBeGreaterThan(-1)
    expect(dnt).toBeGreaterThan(interactions)
    expect(gpc).toBeGreaterThan(dnt)
  })

  // * Tracker v1.9.0 (14-11-2026) takes both signals from the site's saved settings, so the snippet carries no
  // * data-ignore-* whatever these rows say: counting those browsers asks the owner to paste nothing.
  it('the snippet carries no privacy-signal flag, whatever the rows say', () => {
    const { container } = mount()
    fireEvent.click(screen.getByText('Show script'))
    const before = container.querySelector('pre')?.textContent ?? ''
    expect(before).toContain('data-domain')
    toggleRow('Respect Do Not Track')
    toggleRow('Respect Global Privacy Control')
    const after = container.querySelector('pre')?.textContent ?? ''
    expect(after).toBe(before)
    expect(after).not.toMatch(/data-ignore-/)
  })

  it('a site that counts those browsers still gets the plain tag', () => {
    const { container } = mount({ respect_dnt: false, respect_gpc: false })
    expect(snippet(container)).not.toMatch(/data-ignore-/)
  })

  it('calls onPrivacySignalsChange with BOTH current values on every toggle', () => {
    const onPrivacySignalsChange = vi.fn()
    mount({}, { onPrivacySignalsChange })
    toggleRow('Respect Do Not Track')
    expect(onPrivacySignalsChange).toHaveBeenLastCalledWith({ respect_dnt: false, respect_gpc: true })
    toggleRow('Respect Global Privacy Control')
    expect(onPrivacySignalsChange).toHaveBeenLastCalledWith({ respect_dnt: false, respect_gpc: false })
  })

  it('never calls onFeaturesChange for a privacy-signal toggle — the two callbacks stay separate', () => {
    const onFeaturesChange = vi.fn()
    const onPrivacySignalsChange = vi.fn()
    mount({}, { onFeaturesChange, onPrivacySignalsChange })
    toggleRow('Respect Do Not Track')
    expect(onPrivacySignalsChange).toHaveBeenCalledTimes(1)
    expect(onFeaturesChange).not.toHaveBeenCalled()
  })

  it('toggling a FEATURES row never changes the snippet either', () => {
    const { container } = mount()
    fireEvent.click(screen.getByText('Show script'))
    const before = container.querySelector('pre')?.textContent ?? ''
    toggleRow('Scroll depth')
    expect(container.querySelector('pre')?.textContent).toBe(before)
    expect(before).not.toMatch(/data-no-/)
  })

  describe('no builder the panel can render carries a flag', () => {
    it('the raw universal <script> tag', () => {
      const { container } = mount({ respect_gpc: false, respect_dnt: false })
      const text = snippet(container)
      expect(text).toContain('data-domain="example.com"')
      expect(text).not.toMatch(/data-ignore-|data-no-/)
    })

    it('an inline attribute-style framework snippet (Next.js, via renderSnippet)', () => {
      // Installed + framework already selected: the block shows the resolved
      // header, so the snippet is still behind "Show script".
      const { container } = mount({ respect_gpc: false, detected_framework: 'nextjs' })
      expect(screen.getAllByText('app/layout.tsx').length).toBeGreaterThan(0)
      expect(snippet(container)).not.toMatch(/data-ignore-|data-no-/)
    })

    it('an inline-object framework snippet (Nuxt, whose script is a config object)', () => {
      const { container } = mount({ respect_dnt: false, detected_framework: 'nuxt' })
      expect(screen.getAllByText('nuxt.config.ts').length).toBeGreaterThan(0)
      expect(snippet(container)).not.toMatch(/data-ignore-|data-no-/)
    })
  })
})
