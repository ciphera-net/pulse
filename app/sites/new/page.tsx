'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSite } from '@/lib/api/sites'
import { toast } from 'sonner'

export default function NewSitePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    domain: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const site = await createSite(formData)
      toast.success('Site created successfully')
      router.push(`/sites/${site.id}`)
    } catch (error: any) {
      toast.error('Failed to create site: ' + (error.message || 'Unknown error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <h1 className="text-3xl font-bold mb-8 text-neutral-900 dark:text-white">
        Create New Site
      </h1>

      <form onSubmit={handleSubmit} className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-6">
        <div className="mb-4">
          <label htmlFor="name" className="block text-sm font-medium mb-2 text-neutral-900 dark:text-white">
            Site Name
          </label>
          <input
            type="text"
            id="name"
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:ring-2 focus:ring-brand-orange focus:border-transparent"
            placeholder="My Website"
          />
        </div>

        <div className="mb-6">
          <label htmlFor="domain" className="block text-sm font-medium mb-2 text-neutral-900 dark:text-white">
            Domain
          </label>
          <input
            type="text"
            id="domain"
            required
            value={formData.domain}
            onChange={(e) => setFormData({ ...formData, domain: e.target.value.toLowerCase().trim() })}
            className="w-full px-4 py-2 border border-neutral-300 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:ring-2 focus:ring-brand-orange focus:border-transparent"
            placeholder="example.com"
          />
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            Enter your domain without http:// or https://
          </p>
        </div>

        <div className="flex gap-4">
          <button
            type="submit"
            disabled={loading}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating...' : 'Create Site'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="btn-secondary"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
