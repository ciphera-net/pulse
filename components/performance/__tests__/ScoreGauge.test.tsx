import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ScoreGauge from '../ScoreGauge'

// PUL-14: the notched gauge lights round(score/100 × notches) notches in the
// Lighthouse band colour; the rest stay track grey.
function litFills(container: HTMLElement) {
  return Array.from(container.querySelectorAll('polygon')).map((p) => p.getAttribute('fill'))
}

describe('ScoreGauge', () => {
  it('lights notches in proportion to the score, in the band colour', () => {
    const { container } = render(<ScoreGauge score={63} label="Performance" size={92} />)
    const fills = litFills(container)
    expect(fills).toHaveLength(40)
    expect(fills.filter((f) => f === '#ffa400')).toHaveLength(25) // round(0.63 × 40)
    expect(fills.filter((f) => f === 'currentColor')).toHaveLength(15)
  })

  it('uses the green and red bands at their thresholds', () => {
    const { container: green } = render(<ScoreGauge score={90} label="" size={92} />)
    expect(litFills(green)).toContain('#0cce6b')
    const { container: red } = render(<ScoreGauge score={49} label="" size={92} />)
    expect(litFills(red)).toContain('#ff4e42')
  })

  it('draws fewer notches at the small diagnostic size', () => {
    const { container } = render(<ScoreGauge score={100} label="" size={40} />)
    expect(litFills(container)).toEqual(Array(20).fill('#0cce6b'))
  })

  it('shows an em dash and lights nothing when there is no score', () => {
    const { container } = render(<ScoreGauge score={null} label="SEO" size={92} />)
    expect(litFills(container).every((f) => f === 'currentColor')).toBe(true)
    expect(screen.getByText('—')).toBeTruthy()
  })
})
