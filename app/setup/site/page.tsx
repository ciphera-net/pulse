'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSetup } from '@/lib/setup/context'
import { preservePlanParams } from '@/lib/setup/utils'
import { createSite, detectFramework } from '@/lib/api/sites'
import { getAuthErrorMessage } from '@ciphera-net/ui'
import { Button, Input, toast } from '@ciphera-net/ui'
import { GlobeIcon } from '@ciphera-net/ui'

function domainFromUrl(input: string): string {
  let d = input.trim().toLowerCase()
  d = d.replace(/^https?:\/\//, '')
  d = d.replace(/\/.*$/, '')
  d = d.replace(/^www\./, '')
  return d
}

export default function SetupSitePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { setSite, completeStep } = useSetup()

  const [siteDomain, setSiteDomain] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const domain = domainFromUrl(siteDomain)
    if (!domain) return
    setLoading(true)
    setError('')

    try {
      const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone
      const site = await createSite({ name: domain, domain, timezone: browserTz })
      setSite(site)
      completeStep('site')
      // Fire framework detection in the background — does not block navigation.
      detectFramework(domain).then(result => {
        if (result.framework) {
          setSite({ ...site, detected_framework: result.framework })
        }
      }).catch(() => {})
      router.push(`/setup/install${preservePlanParams(searchParams)}`)
    } catch (err) {
      setError(getAuthErrorMessage(err as Error) || 'Failed to add site')
      setLoading(false)
    }
  }

  const handleSkip = () => {
    completeStep('site')
    router.push(`/setup/plan${preservePlanParams(searchParams)}`)
  }

  return (
    <>
      <div className="text-center mb-8">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-400 mb-5">
          <GlobeIcon className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Add your first site
        </h1>
        <p className="mt-2 text-sm text-neutral-400 max-w-sm mx-auto">
          Enter the domain you want to track. You can add more later.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="site-domain" className="block text-sm font-medium text-neutral-300 mb-1.5">
            Domain
          </label>
          <Input
            id="site-domain"
            value={siteDomain}
            onChange={(e) => setSiteDomain(e.target.value)}
            placeholder="example.com"
            autoFocus
            required
          />
        </div>

        {error && (
          <p className="text-sm text-red-400 text-center">{error}</p>
        )}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Adding...' : 'Add site'}
        </Button>
      </form>

      <button
        type="button"
        onClick={handleSkip}
        className="mt-4 w-full text-center text-sm text-neutral-500 hover:text-neutral-400 transition-colors"
      >
        Skip for now
      </button>
    </>
  )
}
