import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { readFileSync } from 'fs'
import { join } from 'path'

// The tab is pure composition: Devices, then Security activity. Each panel is
// tested on its own (DevicesPanel.test.tsx, SecurityActivityCard.test.tsx);
// here a marker stands in for each so this file only asserts the composition.
vi.mock('@/components/settings/security/DevicesPanel', () => ({
  default: () => <section data-panel="devices" />,
}))
vi.mock('@/components/settings/SecurityActivityCard', () => ({
  default: () => <section data-panel="activity" />,
}))

import AccountDevicesTab from '../AccountDevicesTab'

describe('AccountDevicesTab', () => {
  it('composes Devices then Security activity, with no heading of its own', () => {
    const { container } = render(<AccountDevicesTab />)
    const order = Array.from(container.querySelectorAll('[data-panel]')).map((el) => el.getAttribute('data-panel'))
    expect(order).toEqual(['devices', 'activity'])
    expect(screen.queryByRole('heading')).toBeNull()
  })
})

// --- Copy: no dashes anywhere in this tab's source, comments stripped ----
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

describe('copy: no em dash or en dash in source (comments stripped)', () => {
  const files = [
    '../AccountDevicesTab.tsx',
    '../../../security/DevicesPanel.tsx',
    '../../../SecurityActivityCard.tsx',
  ]

  it.each(files)('%s has no dash left once comments are stripped', (relPath) => {
    const source = readFileSync(join(__dirname, relPath), 'utf8')
    expect(stripComments(source)).not.toMatch(/[—–]/)
  })
})
