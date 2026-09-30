import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ScriptSetupBlock from '@/components/sites/ScriptSetupBlock'

/**
 * Do Not Track / Global Privacy Control toggles (PULSE-164) — two new rows at
 * the END of "Customize tracking", their own small list, own polarity: ON
 * means Pulse keeps respecting the browser's signal (the default); OFF adds
 * `data-ignore-dnt` / `data-ignore-gpc` and counts that visitor anyway.
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
 * The snippet lives behind the "Show snippet" disclosure in this state.
 *
 * 🔑 Scoped to the `<pre>` CopyBlock renders the code into — NOT the whole
 * container. The two rows' own caption copy says "your tag gets
 * data-ignore-dnt" / "data-ignore-gpc" in plain prose (exactly as the picked
 * mock), so a container-wide text search for those literal strings would
 * find the CAPTION even with both signals on and every toggle untouched.
 */
function snippet(container: HTMLElement): string {
  fireEvent.click(screen.getByText('Show snippet'))
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
  it('renders both rows with the exact copy from the picked mock', () => {
    mount()
    expect(screen.getByText('Respect Do Not Track')).toBeTruthy()
    expect(
      screen.getByText(
        'Browsers that send Do Not Track are not counted. Turn off to count them; your tag gets data-ignore-dnt.',
      ),
    ).toBeTruthy()
    expect(screen.getByText('Respect Global Privacy Control')).toBeTruthy()
    expect(
      screen.getByText(
        'Browsers that send Global Privacy Control are not counted. GPC is a legal opt-out signal in California and other US states. Turn off to count them; your tag gets data-ignore-gpc.',
      ),
    ).toBeTruthy()
  })

  it('sits after Subresource Integrity — end of the Customize tracking list', () => {
    const { container } = mount()
    const text = container.textContent ?? ''
    const sri = text.indexOf('Subresource Integrity')
    const dnt = text.indexOf('Respect Do Not Track')
    const gpc = text.indexOf('Respect Global Privacy Control')
    expect(sri).toBeGreaterThan(-1)
    expect(dnt).toBeGreaterThan(sri)
    expect(gpc).toBeGreaterThan(dnt)
  })

  it('emits NEITHER attribute while both are on (the default)', () => {
    const { container } = mount()
    const text = snippet(container)
    expect(text).toContain('data-domain')
    expect(text).not.toContain('data-ignore-dnt')
    expect(text).not.toContain('data-ignore-gpc')
  })

  it('emits data-ignore-dnt ONLY once Respect Do Not Track is switched off', () => {
    const { container } = mount()
    toggleRow('Respect Do Not Track')
    const text = snippet(container)
    expect(text).toContain('data-ignore-dnt')
    expect(text).not.toContain('data-ignore-gpc')
  })

  it('emits data-ignore-gpc ONLY once Respect Global Privacy Control is switched off', () => {
    const { container } = mount()
    toggleRow('Respect Global Privacy Control')
    const text = snippet(container)
    expect(text).toContain('data-ignore-gpc')
    expect(text).not.toContain('data-ignore-dnt')
  })

  it('emits BOTH attributes once both are switched off', () => {
    const { container } = mount()
    toggleRow('Respect Do Not Track')
    toggleRow('Respect Global Privacy Control')
    const text = snippet(container)
    expect(text).toContain('data-ignore-dnt')
    expect(text).toContain('data-ignore-gpc')
  })

  it('initialises from the site (respect_dnt: false) without needing a click', () => {
    const { container } = mount({ respect_dnt: false })
    const text = snippet(container)
    expect(text).toContain('data-ignore-dnt')
    expect(text).not.toContain('data-ignore-gpc')
  })

  it('treats an absent respect_dnt / respect_gpc as true (on), never as off', () => {
    // No respect_dnt / respect_gpc on the site object at all — the contract's
    // undefined -> true case.
    const { container } = mount()
    const text = snippet(container)
    expect(text).not.toContain('data-ignore-dnt')
    expect(text).not.toContain('data-ignore-gpc')
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

  describe('no cross-contamination with the existing FEATURES rows', () => {
    it('toggling a privacy signal never touches a FEATURES data-no-* flag', () => {
      const { container } = mount()
      toggleRow('Respect Do Not Track')
      const text = snippet(container)
      expect(text).not.toContain('data-no-scroll')
      expect(text).not.toContain('data-no-outbound')
      expect(text).not.toContain('data-no-downloads')
    })

    it('toggling a FEATURES row never touches a privacy-signal attribute', () => {
      const { container } = mount()
      toggleRow('Scroll depth')
      const text = snippet(container)
      expect(text).toContain('data-no-scroll')
      expect(text).not.toContain('data-ignore-dnt')
      expect(text).not.toContain('data-ignore-gpc')
    })
  })

  describe('every builder the panel can render carries the flags', () => {
    it('the raw universal <script> tag (buildTag)', () => {
      const { container } = mount({ respect_gpc: false })
      const text = snippet(container)
      expect(text).toContain('data-domain="example.com"')
      expect(text).toContain('data-ignore-gpc')
    })

    it('an inline attribute-style framework snippet (Next.js, via renderSnippet)', () => {
      // Installed + framework already selected: the block shows the resolved
      // header, so the snippet is still behind "Show snippet".
      const { container } = mount({ respect_gpc: false, detected_framework: 'nextjs' })
      expect(screen.getAllByText('app/layout.tsx').length).toBeGreaterThan(0)
      const out = snippet(container)
      expect(out).toContain('data-ignore-gpc')
      expect(out).not.toContain('data-ignore-dnt')
    })

    it('an inline-object framework snippet (Nuxt, whose script is a config object)', () => {
      const { container } = mount({ respect_dnt: false, detected_framework: 'nuxt' })
      expect(screen.getAllByText('nuxt.config.ts').length).toBeGreaterThan(0)
      const out = snippet(container)
      // Object-entry syntax, like every other flag on this snippet.
      expect(out).toContain("'data-ignore-dnt': ''")
      expect(out).not.toContain('data-ignore-gpc')
    })
  })
})
