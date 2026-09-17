// StatusChip after round two (owner pick 17-09-2026): a hairline frame, a dot
// and a toned word, no tinted wash behind it, and a colour transition so a
// tone flip (Up → Down, Active → Revoked) eases instead of cutting.
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { StatusChip, type ChipTone } from '@/components/settings/StatusChip'

const TONES: ChipTone[] = ['neutral', 'success', 'info', 'warning', 'danger', 'brand', 'purple']

describe('StatusChip (round two)', () => {
  it('frames every tone with a hairline and no fill', () => {
    for (const tone of TONES) {
      const { container, unmount } = render(<StatusChip tone={tone} dot>Word</StatusChip>)
      const chip = container.firstElementChild as HTMLElement
      expect(chip.className, tone).toMatch(/\bborder\b/)
      expect(chip.className, tone).not.toMatch(/\bbg-[a-z]+(-\d+)?\/\d+/)
      expect(chip.className, tone).not.toMatch(/bg-white\//)
      unmount()
    }
  })

  it('carries the house colour transition so a tone change eases', () => {
    const { container } = render(<StatusChip tone="success" dot>Up</StatusChip>)
    const chip = container.firstElementChild as HTMLElement
    expect(chip.className).toMatch(/\btransition-colors\b/)
    expect(chip.className).toMatch(/\bduration-fast\b/)
    expect(chip.className).toMatch(/\bease-apple\b/)
  })

  it('keeps the geometry sharp and the dot round', () => {
    const { container } = render(<StatusChip tone="danger" dot>Revoked</StatusChip>)
    const chip = container.firstElementChild as HTMLElement
    expect(chip.className).toMatch(/\brounded-none\b/)
    expect(chip.querySelector('.rounded-full')).not.toBeNull()
  })
})
