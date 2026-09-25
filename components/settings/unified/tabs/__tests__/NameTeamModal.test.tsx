import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'

vi.mock('@/lib/api/organization', () => ({
  getOrganization: vi.fn(),
  updateOrganization: vi.fn(),
}))

// The same doubles CreateInviteLinkModal's suite uses: the two modals are one
// device, opened one after the other.
vi.mock('@ciphera-net/facet', () => ({
  Modal: ({ isOpen, children, title }: { isOpen: boolean; children: ReactNode; title?: string }) =>
    isOpen ? <div role="dialog" aria-label={title}>{children}</div> : null,
  // `variant` rides through as a DOM attribute so the rung can be read back.
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) => (
    <button {...props}>{children}</button>
  ),
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  getAuthErrorMessage: () => '',
}))

import NameTeamModal, { suggestTeamName } from '../NameTeamModal'

function sourceWithoutComments(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

describe('suggestTeamName (PULSE-59, N1)', () => {
  it("is the first name's team when a display name is known", () => {
    expect(suggestTeamName('Ada Lovelace', 'Quiet Harbour')).toBe("Ada's team")
    expect(suggestTeamName('  Grace  ', 'Quiet Harbour')).toBe("Grace's team")
  })

  it("falls back to the organization's current name when there is no display name", () => {
    expect(suggestTeamName(undefined, 'Quiet Harbour')).toBe('Quiet Harbour')
    expect(suggestTeamName('   ', ' Quiet Harbour ')).toBe('Quiet Harbour')
  })

  it('never uses an email address as the name', () => {
    expect(suggestTeamName('me@example.com', 'Quiet Harbour')).toBe('Quiet Harbour')
  })

  it('is empty, not a made-up name, when neither is known', () => {
    expect(suggestTeamName(null, null)).toBe('')
  })
})

describe('NameTeamModal device and copy', () => {
  it('uses the invite modal device: the title as the dialog name, Cancel on the outline rung', () => {
    render(<NameTeamModal orgId="org1" suggestedName="Ada's team" open onCancel={() => {}} onNamed={() => {}} />)
    expect(screen.getByRole('dialog', { name: 'Name your team' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' }).getAttribute('variant')).toBe('outline')
    expect(screen.getByRole('button', { name: 'Continue' }).getAttribute('variant')).toBe('default')
    // The help line describes the field for a screen reader too.
    expect(screen.getByLabelText('Team name').getAttribute('aria-describedby')).toBe('team-name-help')
  })

  it('renders nothing while closed', () => {
    const { container } = render(
      <NameTeamModal orgId="org1" suggestedName="Ada's team" open={false} onCancel={() => {}} onNamed={() => {}} />,
    )
    expect(container.textContent).toBe('')
  })

  it('has no em or en dashes and no monospace in its source', () => {
    const src = sourceWithoutComments(join(process.cwd(), 'components/settings/unified/tabs/NameTeamModal.tsx'))
    expect(src).not.toMatch(/[—–]/)
    expect(src).not.toMatch(/font-mono/)
  })
})
