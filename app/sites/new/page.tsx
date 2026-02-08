'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createSite, listSites, type Site } from '@/lib/api/sites'
import { getSubscription } from '@/lib/api/billing'
import { API_URL, APP_URL } from '@/lib/api/client'
import { integrations, getIntegration } from '@/lib/integrations'
import { toast } from '@ciphera-net/ui'
import { getAuthErrorMessage } from '@/lib/utils/authErrors'
import { Button, Input } from '@ciphera-net/ui'
import { CheckCircleIcon, CheckIcon } from '@ciphera-net/ui'

const popularIntegrations = integrations.filter((i) => i.category === 'framework').slice(0, 10)

export default function NewSitePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    domain: '',
  })
  const [createdSite, setCreatedSite] = useState<Site | null>(null)
  const [selectedIntegrationSlug, setSelectedIntegrationSlug] = useState<string | null>(null)
  const [scriptCopied, setScriptCopied] = useState(false)

  // * Check for plan limits on mount
  useEffect(() => {
    const checkLimits = async () => {
      try {
        const [sites, subscription] = await Promise.all([
          listSites(),
          getSubscription()
        ])

        if (subscription?.plan_id === 'solo' && sites.length >= 1) {
          toast.error('Solo plan limit reached (1 site). Please upgrade to add more sites.')
          router.replace('/')
        }
      } catch (error) {
        // Ignore errors here, let the backend handle the hard check on submit
        console.error('Failed to check limits', error)
      }
    }

    checkLimits()
  }, [router])

  const copyScript = useCallback(() => {
    if (!createdSite) return
    const script = `<script defer data-domain="${createdSite.domain}" data-api="${API_URL}" src="${APP_URL}/script.js"></script>`
    navigator.clipboard.writeText(script)
    setScriptCopied(true)
    toast.success('Script copied to clipboard')
    setTimeout(() => setScriptCopied(false), 2000)
  }, [createdSite])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const site = await createSite(formData)
      toast.success('Site created successfully')
      setCreatedSite(site)
    } catch (error: unknown) {
      toast.error(getAuthErrorMessage(error) || 'Failed to create site: ' + ((error as Error)?.message || 'Unknown error'))
    } finally {
      setLoading(false)
    }
  }

  // * Step 2: Show framework picker + script (same as /welcome after adding first site)
  if (createdSite) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-8">
          <div className="text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-500/10 text-green-600 dark:text-green-400 mb-6">
              <CheckCircleIcon className="h-7 w-7" />
            </div>
            <h2 className="text-2xl font-bold text-neutral-900 dark:text-white">
              Site created
            </h2>
            <p className="mt-2 text-neutral-600 dark:text-neutral-400">
              Add the script to your site to start collecting data.
            </p>
          </div>

          <div className="mt-6 pt-6 border-t border-neutral-200 dark:border-neutral-700">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-white mb-1">
              Add the script to your site
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">
              Choose your framework for setup instructions.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
              {popularIntegrations.map((int) => (
                <button
                  key={int.id}
                  type="button"
                  onClick={() => setSelectedIntegrationSlug(selectedIntegrationSlug === int.id ? null : int.id)}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                    selectedIntegrationSlug === int.id
                      ? 'border-brand-orange bg-brand-orange/10 text-brand-orange'
                      : 'border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300'
                  }`}
                >
                  <span className="[&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0 flex items-center justify-center">
                    {int.icon}
                  </span>
                  <span className="truncate font-medium">{int.name}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
              <Link href="/integrations" target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline">
                View all integrations →
              </Link>
            </p>

            <div className="rounded-xl bg-neutral-100 dark:bg-neutral-800 p-4 relative group">
              <code className="text-xs text-neutral-900 dark:text-white break-all font-mono block pr-10">
                {`<script defer data-domain="${createdSite.domain}" data-api="${API_URL}" src="${APP_URL}/script.js"></script>`}
              </code>
              <button
                type="button"
                onClick={copyScript}
                className="absolute top-2 right-2 p-2 bg-white dark:bg-neutral-700 rounded-lg shadow-sm hover:bg-neutral-50 dark:hover:bg-neutral-600 transition-colors"
                title="Copy script"
                aria-label={scriptCopied ? 'Copied' : 'Copy script to clipboard'}
              >
                {scriptCopied ? (
                  <CheckIcon className="w-4 h-4 text-green-500" />
                ) : (
                  <svg className="w-4 h-4 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <rect x="9" y="9" width="13" height="13" rx="2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            </div>
            {selectedIntegrationSlug && getIntegration(selectedIntegrationSlug) && (
              <p className="mt-3 text-xs">
                <Link
                  href={`/integrations/${selectedIntegrationSlug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-orange hover:underline"
                >
                  See full {getIntegration(selectedIntegrationSlug)!.name} guide →
                </Link>
              </p>
            )}
          </div>

          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Button variant="primary" onClick={() => router.push('/')} className="min-w-[160px]">
              Back to dashboard
            </Button>
            <Button variant="secondary" onClick={() => router.push(`/sites/${createdSite.id}`)} className="min-w-[160px]">
              View {createdSite.name}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // * Step 1: Name & domain form
  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <h1 className="text-2xl font-bold mb-8 text-neutral-900 dark:text-white">
        Create New Site
      </h1>

      <form onSubmit={handleSubmit} className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6">
        <div className="mb-4">
          <label htmlFor="name" className="block text-sm font-medium mb-2 text-neutral-900 dark:text-white">
            Site Name
          </label>
          <Input
            id="name"
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="My Website"
          />
        </div>

        <div className="mb-6">
          <label htmlFor="domain" className="block text-sm font-medium mb-2 text-neutral-900 dark:text-white">
            Domain
          </label>
          <Input
            id="domain"
            required
            value={formData.domain}
            onChange={(e) => setFormData({ ...formData, domain: e.target.value.toLowerCase().trim() })}
            placeholder="example.com"
          />
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            Enter your domain without http:// or https://
          </p>
        </div>

        <div className="flex gap-4">
          <Button
            type="submit"
            disabled={loading}
            isLoading={loading}
          >
            Create Site
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}
