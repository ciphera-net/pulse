// The settings kit (settings overhaul round 2: R5, R6, R8, R24, R32). jsdom has no layout, so these pin the rules as
// structure and classes: headings and hairlines with no panels, a heading icon in orange (coral on a Danger zone),
// no icon on a row unless it is a state or a platform's logo, the white knob on a switch that is on, and a status as
// a dot and words in three tones.
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { KitBlock, KitPage, KitRow, KitRows, KitSection, KitStats, KitStatus } from '@/components/settings/kit/Kit'

const Glyph = () => <svg data-testid="glyph" />

describe('KitPage', () => {
  it('spaces sections 48 px apart and turns an on switch\'s knob white (R8)', () => {
    const { container } = render(<KitPage><div /></KitPage>)
    const page = container.querySelector('[data-kit]')!
    expect(page.className).toMatch(/\bspace-y-12\b/)
    // A literal white: Tailwind's `white` is ink in Pulse's light theme. Only a switch that is on.
    expect(page.className).toContain('[&_[role=switch][aria-checked=true]>span]:bg-[#fff]')
  })
})

describe('KitSection', () => {
  it('draws a heading and its line, no panel, the rows between two hairlines', () => {
    const { container } = render(
      <KitSection title="Tracking script" description="Add this script to your site." icon={<Glyph />}>
        <KitRows><KitRow label="Receiving data" /></KitRows>
      </KitSection>,
    )
    const section = container.querySelector('[data-kit-section="Tracking script"]')!
    expect(screen.getByRole('heading', { level: 2, name: 'Tracking script' })).toBeInTheDocument()
    expect(screen.getByText('Add this script to your site.')).toBeInTheDocument()
    expect(section.querySelector('.border-y')).not.toBeNull()
    expect(section.className).not.toMatch(/\bborder\b|\bbg-card\b/)
  })

  it('draws its heading icon in orange, and a Danger zone\'s heading and icon in coral (R6)', () => {
    const { container, rerender } = render(<KitSection title="Name" icon={<Glyph />}><KitRow label="a" /></KitSection>)
    expect(container.querySelector('[data-kit-icon="heading"]')!.className).toMatch(/\btext-primary\b/)
    rerender(<KitSection title="Danger zone" tone="danger" icon={<Glyph />}><KitRow label="a" /></KitSection>)
    expect(container.querySelector('[data-kit-icon="heading"]')!.className).toMatch(/\btext-destructive\b/)
    expect(screen.getByRole('heading', { level: 2 }).className).toMatch(/\btext-destructive\b/)
  })

  it('draws no empty pair of hairlines when nothing is under the heading', () => {
    const { container } = render(<KitSection title="Scheduled emails" aside={<button>Schedule emails</button>} />)
    expect(container.querySelector('.border-y')).toBeNull()
    expect(container.querySelector('[data-kit-aside]')).toHaveTextContent('Schedule emails')
  })
})

describe('KitRow', () => {
  it('labels a field with a real label, and puts the value and the control in their columns', () => {
    render(
      <KitRow label="Name" htmlFor="site-name" caption="Shown in Pulse." control={<button>Save</button>}>
        <input id="site-name" />
      </KitRow>,
    )
    expect(screen.getByLabelText('Name')).toHaveAttribute('id', 'site-name')
    expect(screen.getByText('Shown in Pulse.').className).toMatch(/\btext-xs\b/)
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it('draws no icon on a plain row, only on a state or a platform\'s logo (R6, R9)', () => {
    const { container, rerender } = render(<KitRow label="Scroll depth" icon={<Glyph />} />)
    expect(container.querySelector('[data-kit-icon]')).toBeNull()
    rerender(<KitRow label="Receiving data" icon={<Glyph />} state tone="orange" />)
    expect(container.querySelector('[data-kit-icon="state"]')!.className).toMatch(/\btext-primary\b/)
    rerender(<KitRow label="Script on Next.js" icon={<Glyph />} logo />)
    expect(container.querySelector('[data-kit-icon="logo"]')).not.toBeNull()
  })

  it('keeps the value column only when there is a value', () => {
    const { container, rerender } = render(<KitRow label="Billing" control={<span>Always on</span>} />)
    expect(container.querySelector('[data-kit-row]')!.className).toContain('md:grid-cols-[minmax(0,1fr)_auto]')
    rerender(<KitRow label="Name"><input /></KitRow>)
    expect(container.querySelector('[data-kit-row]')!.className).toContain('md:grid-cols-[minmax(200px,32%)_minmax(0,1fr)_auto]')
  })
})

describe('KitStats and KitBlock', () => {
  it('sets figures side by side, each a label over a number in tabular figures', () => {
    render(<KitStats items={[{ label: 'All time', value: '3,823' }, { label: 'Last 7 days', value: '249' }, { label: 'Last 24 hours', value: '112' }]} />)
    expect(screen.getByText('3,823').className).toMatch(/\btabular-nums\b/)
    expect(screen.getByText('Last 24 hours')).toBeInTheDocument()
  })

  it('gives a block the row\'s rhythm, 16 px top and bottom', () => {
    const { container } = render(<KitBlock><p>script</p></KitBlock>)
    expect(container.querySelector('[data-kit-block]')!.className).toMatch(/\bpy-4\b/)
  })
})

describe('KitStatus (R24, R32)', () => {
  it('leads with a dot and words: orange when live, grey when off, coral when broken', () => {
    const { container, rerender } = render(<KitStatus tone="live">Active</KitStatus>)
    const dot = () => container.querySelector('[data-kit-status] > span[aria-hidden="true"]')!
    const words = () => screen.getByText(/Active|Off|Not working/)
    expect(dot().className).toMatch(/\bbg-primary\b/)
    expect(words().className).toMatch(/\btext-primary\b/)
    rerender(<KitStatus tone="off">Off</KitStatus>)
    expect(dot().className).toMatch(/\bbg-neutral-400\b/)
    expect(words().className).toBe('')
    rerender(<KitStatus tone="broken">Not working</KitStatus>)
    expect(dot().className).toMatch(/\bbg-destructive\b/)
    expect(words().className).toMatch(/\btext-destructive\b/)
  })
})
