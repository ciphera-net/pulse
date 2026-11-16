import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a data-next-link="" href={href} {...rest}>{children}</a>
  ),
}))

import { AppLink } from '../AppLink'

describe('AppLink', () => {
  it('renders a plain anchor for a marketing page, keeping its props', () => {
    render(<AppLink href="/integrations" className="c">Integrations</AppLink>)
    const a = screen.getByText('Integrations')
    expect(a.tagName).toBe('A')
    expect(a.getAttribute('href')).toBe('/integrations')
    expect(a.className).toBe('c')
    expect(a.hasAttribute('data-next-link')).toBe(false)
  })

  it('renders a plain anchor for the home page', () => {
    render(<AppLink href="/">Home</AppLink>)
    expect(screen.getByText('Home').hasAttribute('data-next-link')).toBe(false)
  })

  it('keeps next/link for the dashboard', () => {
    render(<AppLink href="/sites/new">Add</AppLink>)
    expect(screen.getByText('Add').hasAttribute('data-next-link')).toBe(true)
  })
})
