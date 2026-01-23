'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createOrganization } from '@/lib/api/organization'
import { useAuth } from '@/lib/auth/context'
import { LoadingOverlay } from '@ciphera-net/ui'
import { Button, Input } from '@ciphera-net/ui'

export default function OnboardingPage() {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const { user } = useAuth()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      await createOrganization(name, slug)
      // * Redirect to home, AuthContext will detect the new org and auto-switch
      router.push('/')
    } catch (err: any) {
      setError(err.message || 'Failed to create organization')
    } finally {
      setLoading(false)
    }
  }

  // * Auto-generate slug from name
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setName(val)
    if (!slug || slug === name.toLowerCase().replace(/[^a-z0-9]/g, '-')) {
      setSlug(val.toLowerCase().replace(/[^a-z0-9]/g, '-'))
    }
  }

  if (loading) return <LoadingOverlay logoSrc="/pulse_icon_no_margins.png" title="Creating Organization..." />

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-neutral-900 px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h2 className="mt-6 text-3xl font-bold text-gray-900 dark:text-white">
            Welcome to Pulse
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            To get started, please create an organization for your team.
          </p>
        </div>
        
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm space-y-4">
            <div>
              <label htmlFor="org-name" className="sr-only">Organization Name</label>
              <Input
                id="org-name"
                name="name"
                type="text"
                required
                placeholder="Organization Name (e.g. Acme Corp)"
                value={name}
                onChange={handleNameChange}
              />
            </div>
            <div>
              <label htmlFor="org-slug" className="sr-only">URL Slug</label>
              <Input
                id="org-slug"
                name="slug"
                type="text"
                required
                placeholder="URL Slug (e.g. acme-corp)"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
              />
              <p className="text-xs text-gray-500 mt-1">
                This will be used in your organization's URL.
              </p>
            </div>
          </div>

          {error && (
            <div className="text-red-500 text-sm text-center">
              {error}
            </div>
          )}

          <div>
            <Button
              type="submit"
              className="w-full"
            >
              Create Organization
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
