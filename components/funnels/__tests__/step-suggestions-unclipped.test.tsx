import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// pulse#758: the event-step suggestion list was clipped to the step's box
// because the step's animation wrapper carried a permanent overflow-hidden.
// The wrapper may clip only while its height animates.

// framer-motion, with the animation props forwarded as data attributes so the
// clip contract (initial/exit hidden, animate ends visible) is assertable.
// ⚠️ The module object must not expose a callable `then` (a bare Proxy hangs
// vitest's dynamic import as a never-resolving thenable) — hence the guard.
vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === 'then') return undefined
        return ({ children, className, initial, animate, exit }: any) => (
          <div
            className={className}
            data-motion="wrapper"
            data-initial={JSON.stringify(initial ?? null)}
            data-animate={JSON.stringify(animate ?? null)}
            data-exit={JSON.stringify(exit ?? null)}
          >
            {children}
          </div>
        )
      },
    },
  ),
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: any) => <div data-testid="dialog">{children}</div>,
  DialogContent: ({ children }: any) => <div data-testid="dialog-content">{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
}))
vi.mock('@/components/dashboard/MetricInfoTip', () => ({ TermInfoTip: () => null }))
vi.mock('@/lib/api/stats', () => ({
  getDashboardPages: vi.fn(async () => ({ pages: [] })),
  getDashboardGoals: vi.fn(async () => ({
    goal_counts: [
      { event_name: 'pulse_click', display_name: null, count: 2374 },
      { event_name: 'signup', display_name: 'Signup', count: 12 },
    ],
  })),
}))
vi.mock('@/lib/api/funnels', () => ({ previewFunnel: vi.fn(async () => null) }))

import FunnelModal from '@/components/funnels/FunnelModal'

describe('funnel step suggestion list', () => {
  it('is not clipped by the step wrapper, which clips only while its height animates', async () => {
    render(
      <FunnelModal
        isOpen
        onClose={() => {}}
        onSubmit={async () => {}}
        siteId="site-1"
        prefill={{ name: 'f', steps: [
          { name: 'Step 1', value: '/', type: 'exact' },
          { name: 'Step 2', value: '', type: 'exact', category: 'event' },
        ] } as any}
      />,
    )

    // Let the facet segmented control's layout effects settle before querying.
    await new Promise((r) => setTimeout(r, 50))
    const input = await screen.findByLabelText('Step 2 event')
    fireEvent.focus(input)
    const list = await screen.findByRole('listbox', { name: 'Step 2 event suggestions' })
    await waitFor(() => expect(screen.getByRole('option', { name: /pulse_click/ })).toBeTruthy())

    // No ancestor between the list and the dialog content clips it.
    const content = screen.getByTestId('dialog-content')
    for (let el = list.parentElement; el && el !== content; el = el.parentElement) {
      expect(el.className.split(/\s+/)).not.toContain('overflow-hidden')
      expect(el.style.overflow).not.toBe('hidden')
    }

    // The step's animation wrapper clips during enter/exit and ends visible.
    const wrapper = list.closest('[data-motion="wrapper"]') as HTMLElement
    expect(wrapper).toBeTruthy()
    expect(JSON.parse(wrapper.dataset.initial!)).toMatchObject({ height: 0, overflow: 'hidden' })
    expect(JSON.parse(wrapper.dataset.exit!)).toMatchObject({ height: 0, overflow: 'hidden' })
    expect(JSON.parse(wrapper.dataset.animate!)).toMatchObject({ height: 'auto', transitionEnd: { overflow: 'visible' } })
  })
})
