import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EmptyRow } from '../EmptyRow'

describe('EmptyRow ghost + ghostLabel', () => {
  it('keeps the ghost preview inert and hidden from assistive tech', () => {
    render(<EmptyRow title="No goals yet" ghost={<span>Sign up</span>} />)
    const ghost = screen.getByText('Sign up').closest('[aria-hidden="true"]')
    expect(ghost).toBeTruthy()
    expect(ghost?.className).toMatch(/opacity-40/)
  })

  it('renders ghostLabel as real, legible content outside the aria-hidden ghost wrapper', () => {
    render(<EmptyRow title="No goals yet" ghost={<span>Sign up</span>} ghostLabel="Example" />)
    const label = screen.getByText('Example')
    expect(label.closest('[aria-hidden="true"]')).toBeNull()
    expect(label.closest('.opacity-40')).toBeNull()
  })

  it('renders no chip at all when ghostLabel is absent', () => {
    render(<EmptyRow title="No goals yet" ghost={<span>Sign up</span>} />)
    expect(screen.queryByText('Example')).toBeNull()
  })
})
