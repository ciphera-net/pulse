'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createSite, listSites } from '@/lib/api/sites'
import { getSubscription } from '@/lib/api/billing'
import { toast } from '@ciphera-net/ui'
import { getAuthErrorMessage } from '@/lib/utils/authErrors'
import { Button, Input } from '@ciphera-net/ui'

export default function NewSitePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    domain: '',
  })

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const site = await createSite(formData)
      toast.success('Site created successfully')
      router.push(`/sites/${site.id}`)
    } catch (error: any) {
      toast.error(getAuthErrorMessage(error) || 'Failed to create site: ' + ((error as Error)?.message || 'Unknown error'))
    } finally {
      setLoading(false)
    }
  }

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
