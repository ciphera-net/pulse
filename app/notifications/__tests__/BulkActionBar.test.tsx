import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import BulkActionBar from '../BulkActionBar'

// The destructive purge flow had no test at all before 29-08-2026, which is how
// the confirmation came to state the length of the filtered, 100-capped visible
// list while purgeMine() deleted every receipt the user had.

const purgeMine = vi.fn().mockResolvedValue(undefined)
const markAllRead = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/api/notifications-v2', () => ({
  purgeMine: () => purgeMine(),
  markAllRead: () => markAllRead(),
}))

beforeEach(() => {
  purgeMine.mockClear()
  markAllRead.mockClear()
})

function openDialog(purgeCount: number | null) {
  render(<BulkActionBar purgeCount={purgeCount} unreadCount={0} onChange={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: 'Purge mine' }))
}

describe('BulkActionBar purge confirmation', () => {
  // THE regression. 300 is the true total; a filtered page showing 3 rows is
  // the situation that produced the wrong number.
  it('states the account-wide total, not the visible page', () => {
    openDialog(300)
    expect(screen.getByText(/permanently deletes all 300 notifications/i)).toBeInTheDocument()
  })

  it('singularises correctly', () => {
    openDialog(1)
    expect(screen.getByText(/permanently deletes all 1 notification\b/i)).toBeInTheDocument()
    expect(screen.queryByText(/1 notifications/i)).not.toBeInTheDocument()
  })

  // The server could not count. Stating "0" here would understate a destructive
  // action, which is the whole defect — so no number must appear at all.
  it('states no number when the total is unknown, and never invents a 0', () => {
    openDialog(null)
    expect(
      screen.getByText(/permanently deletes all of your notification history/i)
    ).toBeInTheDocument()
    expect(screen.queryByText(/deletes all 0/i)).not.toBeInTheDocument()
  })

  it('leaves the button usable when the total is unknown', () => {
    render(<BulkActionBar purgeCount={null} unreadCount={0} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Purge mine' })).not.toBeDisabled()
  })

  it('disables the button only when the account is genuinely empty', () => {
    render(<BulkActionBar purgeCount={0} unreadCount={0} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Purge mine' })).toBeDisabled()
  })

  // The confirmation must still actually gate: typing nothing must not purge.
  it('requires the typed confirmation before purging', async () => {
    openDialog(300)
    const confirm = screen.getByRole('button', { name: /delete everything/i })
    expect(confirm).toBeDisabled()
    fireEvent.click(confirm)
    expect(purgeMine).not.toHaveBeenCalled()

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'DELETE' } })
    expect(confirm).not.toBeDisabled()
    fireEvent.click(confirm)
    await waitFor(() => expect(purgeMine).toHaveBeenCalledTimes(1))
  })
})
