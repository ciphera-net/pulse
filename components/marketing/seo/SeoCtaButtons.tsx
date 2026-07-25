'use client'

import Link from 'next/link'
import { ArrowRightIcon, Button } from '@ciphera-net/facet'
import { initiateSignupFlow } from '@/lib/api/oauth'

/**
 * Shared call-to-action pair for the SEO cluster (/vs, category, tools pages):
 * a primary "Get started free" that kicks off the OPAQUE signup flow, and a
 * secondary link to the public live demo. Client component because the signup
 * flow runs in the browser; the surrounding pages stay server-rendered.
 */
export function SeoCtaButtons({ className }: { className?: string }) {
  return (
    <div className={className ?? 'flex flex-wrap items-center gap-3'}>
      <Button size="lg" onClick={() => initiateSignupFlow()}>
        Get started free
        <ArrowRightIcon className="ml-2 h-4 w-4" aria-hidden="true" />
      </Button>
      <Button asChild variant="outline" size="lg">
        <Link href="/demo">See the live demo</Link>
      </Button>
    </div>
  )
}
