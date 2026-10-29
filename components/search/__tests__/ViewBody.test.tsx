import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import type { ReactNode } from 'react'

vi.mock('@/components/dashboard/MetricInfoTip', () => ({ TermInfoTip: () => null }))

import { ViewBody } from '../rowPrimitives'
import { SiteScopeProvider, type SiteScope } from '@/lib/scope/SiteScope'
import { DEMO, MEMBER } from '@/components/surfaces/__tests__/integrationHarness'

afterEach(cleanup)

// The failed state of every Search table view. Its reassurance ("your data is safe")
// is for members, whose data it is, so it is said to a member and to a page outside any
// scope, and not to a public visitor, who has none of their own.
function failed(scope: SiteScope | null) {
  const body: ReactNode = (
    <ViewBody isLoading={false} hasData={false} error={new Error('down')} isEmpty={false} emptyNode={null} onRetry={() => {}}>
      <span>rows</span>
    </ViewBody>
  )
  return render(scope ? <SiteScopeProvider scope={scope}>{body}</SiteScopeProvider> : body)
}

describe('ViewBody, failed', () => {
  it('reassures a member that their data is safe', () => {
    failed(MEMBER)
    expect(screen.getByText(/Your data is safe — this is a loading problem\./)).toBeInTheDocument()
  })

  it('reassures outside any scope, as before the page had one', () => {
    failed(null)
    expect(screen.getByText(/Your data is safe — this is a loading problem\./)).toBeInTheDocument()
  })

  it('tells a public visitor only what failed', () => {
    failed(DEMO)
    expect(screen.getByText('The Search Console request failed for this period.')).toBeInTheDocument()
    expect(screen.queryByText(/Your data/)).toBeNull()
  })

  it('still offers the retry in every case', () => {
    failed(DEMO)
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })
})
