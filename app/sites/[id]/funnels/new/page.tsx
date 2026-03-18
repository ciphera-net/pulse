'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSWRConfig } from 'swr'
import { createFunnel, type CreateFunnelRequest } from '@/lib/api/funnels'
import { toast } from '@ciphera-net/ui'
import FunnelForm from '@/components/funnels/FunnelForm'

export default function CreateFunnelPage() {
  const params = useParams()
  const router = useRouter()
  const { mutate } = useSWRConfig()
  const siteId = params.id as string
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (data: CreateFunnelRequest) => {
    try {
      setSaving(true)
      await createFunnel(siteId, data)
      await mutate(['funnels', siteId])
      toast.success('Funnel created')
      router.push(`/sites/${siteId}/funnels`)
    } catch {
      toast.error('Failed to create funnel. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <FunnelForm
      siteId={siteId}
      onSubmit={handleSubmit}
      submitLabel={saving ? 'Creating...' : 'Create Funnel'}
      cancelHref={`/sites/${siteId}/funnels`}
    />
  )
}
