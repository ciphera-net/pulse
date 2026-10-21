import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { SyncStatusLine } from '../SyncStatusLine'

afterEach(cleanup)

describe('SyncStatusLine', () => {
  it('renders nothing until the status is known', () => {
    const { container } = render(<SyncStatusLine settingsHref="/settings/site/integrations" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('on a failed sync, gives the provider text and the way to fix it', () => {
    render(<SyncStatusLine status="error" errorMessage="token revoked" settingsHref="/settings/site/integrations" />)
    expect(screen.getByText(/Sync failed — token revoked/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Fix in Settings' })).toHaveAttribute('href', '/settings/site/integrations')
  })

  it('on a failed sync with no settings to go to, says so and stops: no link, no separator', () => {
    const { container } = render(<SyncStatusLine status="error" />)
    expect(screen.getByText('Sync failed')).toBeInTheDocument()
    expect(container.querySelectorAll('a')).toHaveLength(0)
    expect(container.textContent).toBe('Sync failed')
  })

  it('says it is syncing', () => {
    render(<SyncStatusLine status="syncing" settingsHref="/settings/site/integrations" />)
    expect(screen.getByText(/Syncing/)).toBeInTheDocument()
  })

  it('gives the last sync when there is a real timestamp, and nothing when there is not', () => {
    const { rerender, container } = render(<SyncStatusLine status="active" lastSyncedAt="2026-10-19T04:00:00Z" />)
    expect(container.textContent).toMatch(/^Last synced /)
    rerender(<SyncStatusLine status="active" lastSyncedAt={null} />)
    expect(container).toBeEmptyDOMElement()
  })
})
