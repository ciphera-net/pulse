import { describe, it, expect, vi } from 'vitest'
import { useEffect, useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { motion } from './framer-mock'

// WHY this file exists: a Proxy `get` trap that returns a fresh component
// from every property access hands React a new component TYPE on every
// render, so React unmounts and remounts the whole subtree instead of
// reconciling in place — that is what most of the seven inline mocks this
// item replaces actually did. The first two cases below are the red-first
// evidence: the OLD per-file pattern remounts a child on a re-render that
// touches nothing the child depends on; the shared mock does not.

function MountCounter({ onMount }: { onMount: () => void }) {
  useEffect(() => {
    onMount()
  }, [onMount])
  return null
}

function CountingHarness({ Motion, onMount }: { Motion: any; onMount: () => void }) {
  const [tick, setTick] = useState(0)
  return (
    <Motion.div>
      <MountCounter onMount={onMount} />
      <button onClick={() => setTick((t) => t + 1)}>tick {tick}</button>
    </Motion.div>
  )
}

describe('framer-mock', () => {
  it('mounts a child inside motion.div exactly once across an unrelated re-render', () => {
    const onMount = vi.fn()
    render(<CountingHarness Motion={motion} onMount={onMount} />)
    expect(onMount).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: /tick/ }))
    // `motion.div` is the same cached component on both renders, so React
    // reconciles the subtree in place: the child's mount effect fires once.
    expect(onMount).toHaveBeenCalledTimes(1)
  })

  it('red-first: a fresh-per-get Proxy (the old inline pattern) remounts the same child on the same re-render', () => {
    // The shape most of the seven files carried before this mock existed:
    // `get` returns a brand-new arrow function every time `motion.div` is
    // read, so it is a new component type on every render.
    const OldMotion = new Proxy(
      {},
      { get: () => ({ children, ...props }: any) => <div {...props}>{children}</div> },
    ) as any

    const onMount = vi.fn()
    render(<CountingHarness Motion={OldMotion} onMount={onMount} />)
    expect(onMount).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: /tick/ }))
    // This is the bug this item exists to kill: a fresh component type on
    // every render unmounts and remounts the whole subtree, so the child's
    // mount effect fires a second time for a click that never touched it.
    expect(onMount).toHaveBeenCalledTimes(2)
  })

  it('passes className, data-*, aria-*, and children through to the plain element', () => {
    render(
      <motion.div className="rounded-none" data-testid="passthrough" data-foo="bar" aria-label="panel">
        content
      </motion.div>,
    )
    const el = screen.getByTestId('passthrough')
    expect(el.tagName).toBe('DIV')
    expect(el.className).toBe('rounded-none')
    expect(el.getAttribute('data-foo')).toBe('bar')
    expect(el.getAttribute('aria-label')).toBe('panel')
    expect(el.textContent).toBe('content')
  })

  it('renders the real tag a motion.<tag> names, not always a div', () => {
    render(
      <table>
        <tbody>
          <motion.tr data-testid="row">
            <td>cell</td>
          </motion.tr>
        </tbody>
      </table>,
    )
    expect(screen.getByTestId('row').tagName).toBe('TR')
  })

  it('drops framer-only props before they reach the DOM', () => {
    render(
      <motion.div
        data-testid="motion-only"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        layout
        whileHover={{ scale: 1.1 }}
      >
        content
      </motion.div>,
    )
    const el = screen.getByTestId('motion-only')
    expect(el.hasAttribute('initial')).toBe(false)
    expect(el.hasAttribute('animate')).toBe(false)
    expect(el.hasAttribute('exit')).toBe(false)
    expect(el.hasAttribute('transition')).toBe(false)
    expect(el.hasAttribute('layout')).toBe(false)
    expect(el.hasAttribute('whilehover')).toBe(false)
    // Belt and braces: no attribute-shaped leak of any framer-only prop name.
    expect(el.outerHTML).not.toMatch(/initial|animate|transition|whilehover/i)
  })
})
