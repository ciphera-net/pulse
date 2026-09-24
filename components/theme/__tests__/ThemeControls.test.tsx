/**
 * The two Theme controls (PULSE-31): picture cards in Settings (owner pick A) and
 * the inline switch in the user menu (owner pick M1). Both write through
 * usePreferences().setTheme, so they cannot disagree.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Theme } from '@/lib/theme'

const prefs = { theme: 'dark' as Theme | null, loaded: true, setTheme: vi.fn(async (_t: Theme) => true) }
vi.mock('@/lib/hooks/usePreferences', () => ({ usePreferences: () => prefs }))
const toastError = vi.fn()
vi.mock('@ciphera-net/facet', async (orig) => ({
  ...(await orig<typeof import('@ciphera-net/facet')>()),
  toast: { error: (m: string) => toastError(m) },
}))

import ThemePicker from '../ThemePicker'
import ThemeMenuSwitch from '../ThemeMenuSwitch'

beforeEach(() => {
  prefs.theme = 'dark'
  prefs.loaded = true
  prefs.setTheme = vi.fn(async () => true)
  toastError.mockClear()
})

describe('ThemePicker (Settings)', () => {
  it('shows three named cards, each with a preview, and marks the saved one', () => {
    prefs.theme = 'light'
    const { container } = render(<ThemePicker />)
    const radios = screen.getAllByRole('radio')
    expect(radios.map((r) => r.textContent)).toEqual(['Dark', 'Light', 'Match system'])
    expect(screen.getByRole('radio', { name: 'Light' })).toHaveAttribute('aria-checked', 'true')
    expect(container.querySelectorAll('[data-preview]').length).toBeGreaterThanOrEqual(3)
  })

  it('saves the chosen theme', async () => {
    render(<ThemePicker />)
    fireEvent.click(screen.getByRole('radio', { name: 'Match system' }))
    expect(prefs.setTheme).toHaveBeenCalledWith('system')
  })

  it('does not re-save the theme that is already chosen', async () => {
    render(<ThemePicker />)
    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }))
    expect(prefs.setTheme).not.toHaveBeenCalled()
  })

  it('moves and selects with the arrow keys, with a single tab stop', async () => {
    render(<ThemePicker />)
    const dark = screen.getByRole('radio', { name: 'Dark' })
    expect(screen.getAllByRole('radio').filter((r) => r.tabIndex === 0)).toEqual([dark])
    dark.focus()
    fireEvent.keyDown(dark, { key: 'ArrowRight' })
    expect(prefs.setTheme).toHaveBeenCalledWith('light')
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Light' }))
  })

  it('says so when the save fails', async () => {
    prefs.setTheme = vi.fn(async () => false)
    render(<ThemePicker />)
    fireEvent.click(screen.getByRole('radio', { name: 'Light' }))
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Couldn't save your theme. Nothing changed."))
  })

  it('is disabled until the account preference has loaded', () => {
    prefs.loaded = false
    prefs.theme = null
    render(<ThemePicker />)
    for (const r of screen.getAllByRole('radio')) expect(r).toBeDisabled()
  })

  it("keeps the Dark preview dark and the Light preview light whatever the page's theme", () => {
    document.documentElement.classList.add('light')
    const { container } = render(<ThemePicker />)
    const bg = (t: string) => (container.querySelector(`[data-preview="${t}"]`) as HTMLElement).style.background
    expect(bg('dark')).toBe('rgb(10, 10, 10)')
    expect(bg('light')).toBe('rgb(244, 244, 244)')
    document.documentElement.classList.remove('light')
  })
})

describe('ThemeMenuSwitch (user menu)', () => {
  it('names every icon button, because the icons carry no words', () => {
    render(<ThemeMenuSwitch />)
    expect(screen.getAllByRole('radio').map((r) => r.getAttribute('aria-label'))).toEqual(['Dark', 'Light', 'Match system'])
    expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeInTheDocument()
  })

  it('marks the saved theme and saves a new one', async () => {
    prefs.theme = 'system'
    render(<ThemeMenuSwitch />)
    expect(screen.getByRole('radio', { name: 'Match system' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('radio', { name: 'Light' }))
    expect(prefs.setTheme).toHaveBeenCalledWith('light')
  })
})
