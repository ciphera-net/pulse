'use client'

import { SWRConfig } from 'swr'
import { boundedCacheProvider } from '@/lib/swr/cache-provider'

export default function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig value={{ provider: boundedCacheProvider }}>
      {children}
    </SWRConfig>
  )
}
