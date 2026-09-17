import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ScriptSetupBlock from '@/components/sites/ScriptSetupBlock'

/**
 * The resolved header's platform button. It used to borrow the page's one
 * orange (border-primary/text-primary) when no platform was set — a second
 * rung outside the button ladder, on a surface whose only orange is meant to
 * be the flow's own primary action. It is always the outline rung now; only
 * the label switches on selection.
 */
vi.mock('@/lib/swr/dashboard', () => ({
  useInstallStatus: () => ({ data: { install_status: 'active' }, isLoading: false }),
}))

describe('ScriptSetupBlock platform button', () => {
  it('stays on the outline rung when no platform is set', () => {
    render(<ScriptSetupBlock site={{ domain: 'example.com' }} siteId="s1" />)
    const button = screen.getByRole('button', { name: /Set platform/i })
    expect(button.className).not.toContain('border-primary')
    expect(button.className).not.toContain('text-primary')
    expect(button.className).toContain('border-border')
  })
})
