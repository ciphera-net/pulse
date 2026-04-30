'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSWRConfig } from 'swr'
import { getFunnel, updateFunnel, type Funnel, type CreateFunnelRequest } from '@/lib/api/funnels'
import { toast } from '@ciphera-net/ui'
import FunnelForm from '@/components/funnels/FunnelForm'
import { FunnelDetailSkeleton } from '@/components/skeletons'

export default function EditFunnelPage() {
  const params = useParams()
  const router = useRouter()
  const { mutate } = useSWRConfig()
  const siteId = params.id as string
  const funnelId = params.funnelId as string
  const [funnel, setFunnel] = useState<Funnel | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getFunnel(siteId, funnelId).then(setFunnel).catch(() => {
      toast.error('Failed to load funnel')
      router.push(`/sites/${siteId}/funnels`)
    })
  }, [siteId, funnelId, router])

  const handleSubmit = async (data: CreateFunnelRequest) => {
    try {
      setSaving(true)
      await updateFunnel(siteId, funnelId, data)
      await mutate(['funnels', siteId])
      toast.success('Funnel updated')
      router.push(`/sites/${siteId}/funnels`)
    } catch {
      toast.error('Failed to update funnel. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (!funnel) return <FunnelDetailSkeleton />

  return (
    <FunnelForm
      siteId={siteId}
      initialData={{
        name: funnel.name,
        description: funnel.description,
        steps: funnel.steps.map(({ order, ...rest }) => rest),
        conversion_window_value: funnel.conversion_window_value,
        conversion_window_unit: funnel.conversion_window_unit,
      }}
      onSubmit={handleSubmit}
      submitLabel={saving ? 'Saving...' : 'Save Changes'}
      cancelHref={`/sites/${siteId}/funnels`}
    />
  )
}
