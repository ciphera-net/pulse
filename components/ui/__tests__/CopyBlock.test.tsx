import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react'

// The shared copy device (PULSE-54). What these pin: it copies exactly the text shown; it says
// "Copied" only once the clipboard write has RESOLVED; a refused write is an error toast, never a
// success; the success toast is optional.
const toastSuccess = vi.fn()
const toastError = vi.fn()
vi.mock('@ciphera-net/facet', () => ({
  cn: (...args: any[]) => args.flat(Infinity).filter(Boolean).join(' '),
  CheckIcon: () => <span data-icon="check" />,
  CopyIcon: () => <span data-icon="copy" />,
  toast: { success: (...a: unknown[]) => toastSuccess(...a), error: (...a: unknown[]) => toastError(...a) },
}))

import { CopyBlock } from '../CopyBlock'

const writeText = vi.fn()
beforeEach(() => {
  toastSuccess.mockReset(); toastError.mockReset(); writeText.mockReset()
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
})
afterEach(() => { vi.useRealTimers() })

describe('CopyBlock', () => {
  it('shows the label and the exact text, and copies that text', async () => {
    writeText.mockResolvedValue(undefined)
    const onCopy = vi.fn()
    render(<CopyBlock label="Terminal" code={'claude mcp login pulse'} copiedToast="Copied it" onCopy={onCopy} />)
    expect(screen.getByText('Terminal')).toBeTruthy()
    expect(screen.getByText('claude mcp login pulse')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Copy Terminal' }))
    await waitFor(() => expect(screen.getByText('Copied')).toBeTruthy())
    expect(writeText).toHaveBeenCalledWith('claude mcp login pulse')
    expect(toastSuccess).toHaveBeenCalledWith('Copied it')
    expect(onCopy).toHaveBeenCalledTimes(1)
  })

  it('does not say Copied before the clipboard write resolves', async () => {
    let resolve!: () => void
    writeText.mockReturnValue(new Promise<void>((r) => { resolve = r }))
    render(<CopyBlock label="Server URL" code="https://pulse-api.ciphera.net/mcp" />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy Server URL' }))
    expect(screen.queryByText('Copied')).toBeNull()
    await act(async () => { resolve() })
    expect(screen.getByText('Copied')).toBeTruthy()
  })

  it('reports a refused clipboard as an error, never as a copy', async () => {
    writeText.mockRejectedValue(new Error('denied'))
    const onCopy = vi.fn()
    render(<CopyBlock label="Terminal" code="x" copiedToast="Copied it" onCopy={onCopy} />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy Terminal' }))
    await waitFor(() => expect(toastError).toHaveBeenCalled())
    expect(screen.queryByText('Copied')).toBeNull()
    expect(toastSuccess).not.toHaveBeenCalled()
    expect(onCopy).not.toHaveBeenCalled()
  })

  it('reports a browser with no clipboard API the same way', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
    render(<CopyBlock label="Terminal" code="x" />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy Terminal' }))
    await waitFor(() => expect(toastError).toHaveBeenCalled())
  })

  it('announces the copy to a screen reader only once the write resolves, and never a refusal', async () => {
    let resolve!: () => void
    writeText.mockReturnValue(new Promise<void>((r) => { resolve = r }))
    const { container } = render(<CopyBlock label="Terminal" copyName="Terminal for step 2" code="claude mcp login pulse" />)
    const live = container.querySelector('[aria-live="polite"]')!
    fireEvent.click(screen.getByRole('button', { name: 'Copy Terminal for step 2' }))
    expect(live.textContent).toBe('')
    await act(async () => { resolve() })
    expect(live.textContent).toBe('Terminal for step 2 copied')

    writeText.mockRejectedValue(new Error('denied'))
    const refused = render(<CopyBlock label="Header" code="x" />)
    fireEvent.click(within(refused.container).getByRole('button', { name: 'Copy Header' }))
    await waitFor(() => expect(toastError).toHaveBeenCalled())
    expect(refused.container.querySelector('[aria-live="polite"]')!.textContent).toBe('')
  })

  it('sends no success toast when none is asked for', async () => {
    writeText.mockResolvedValue(undefined)
    render(<CopyBlock label="Terminal" code="x" />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy Terminal' }))
    await waitFor(() => expect(screen.getByText('Copied')).toBeTruthy())
    expect(toastSuccess).not.toHaveBeenCalled()
  })
})
