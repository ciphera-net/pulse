// SettingsPanel is the frame every settings section lives in. Its title is set
// the way the dashboard's SectionHeader sets one (sentence case, text-sm
// font-semibold tracking-tight, foreground) — the uppercase micro-label
// kicker it used to render was the single largest reason settings did not
// read as Pulse (overhaul doc §4.8). These pin that, and pin that nobody
// brings the kicker back under either name.
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { SettingsPanel } from '@/components/settings/panels'

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (name === 'node_modules' || name === '__tests__') continue
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

describe('SettingsPanel', () => {
  it('titles a section like the dashboard does, not as an uppercase kicker', () => {
    render(<SettingsPanel title="Tracking script" description="Add this to your site.">body</SettingsPanel>)
    const h2 = screen.getByRole('heading', { level: 2, name: 'Tracking script' })
    expect(h2.className).toMatch(/\btext-sm\b/)
    expect(h2.className).toMatch(/\bfont-semibold\b/)
    expect(h2.className).toMatch(/\btracking-tight\b/)
    expect(h2.className).not.toMatch(/uppercase|micro-label/)
    // The landmark is labelled by its own heading.
    const section = h2.closest('section')!
    expect(section.getAttribute('aria-labelledby')).toBe(h2.id)
    expect(screen.getByText('Add this to your site.')).toBeInTheDocument()
  })

  it('puts the action at the header\'s right and rules the header off only when titled', () => {
    const { container, rerender } = render(
      <SettingsPanel title="Members" action={<button>Invite member</button>}>rows</SettingsPanel>,
    )
    expect(screen.getByRole('button', { name: 'Invite member' })).toBeInTheDocument()
    expect(container.querySelector('header')!.className).toMatch(/border-b/)
    rerender(<SettingsPanel action={<button>Only action</button>}>rows</SettingsPanel>)
    expect(container.querySelector('header')!.className).not.toMatch(/border-b/)
    rerender(<SettingsPanel>rows</SettingsPanel>)
    expect(container.querySelector('header')).toBeNull()
  })

  it('puts danger in the word and the hairline, never in a tinted surface', () => {
    const { container } = render(<SettingsPanel tone="danger" title="Danger zone">rows</SettingsPanel>)
    const section = container.querySelector('section')!
    expect(section.className).toMatch(/border-destructive\/30/)
    expect(section.className).not.toMatch(/bg-destructive/)
    expect(screen.getByRole('heading', { level: 2 }).className).toMatch(/text-destructive/)
  })

  it('has no kicker prop, and nothing in the settings tree passes one', () => {
    const own = readFileSync(join(process.cwd(), 'components/settings/panels/SettingsPanel.tsx'), 'utf8')
    expect(own).not.toMatch(/\bkicker\b/)
    const files = [
      ...walk(join(process.cwd(), 'components/settings')),
      ...walk(join(process.cwd(), 'app/settings')),
    ]
    expect(files.length).toBeGreaterThan(20)
    const offenders = files.filter((f) => /\title=/.test(readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
  })
})
