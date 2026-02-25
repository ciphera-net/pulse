'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getAdminOrg, grantPlan, type AdminOrgDetail } from '@/lib/api/admin'
import { Card, CardHeader, CardTitle, CardContent, Button, LoadingOverlay, Select, toast } from '@ciphera-net/ui'
import { format, addMonths, addYears } from 'date-fns'

const PLAN_OPTIONS = [
  { value: 'free', label: 'Free' },
  { value: 'solo', label: 'Solo' },
  { value: 'team', label: 'Team' },
  { value: 'business', label: 'Business' },
]

const INTERVAL_OPTIONS = [
  { value: 'month', label: 'Monthly' },
  { value: 'year', label: 'Yearly' },
]

const LIMIT_OPTIONS = [
  { value: '1000', label: '1k (Free)' },
  { value: '10000', label: '10k (Solo)' },
  { value: '100000', label: '100k (Team)' },
  { value: '1000000', label: '1M (Business)' },
  { value: '5000000', label: '5M' },
  { value: '10000000', label: '10M' },
]

export default function AdminOrgDetailPage() {
  const params = useParams()
  const router = useRouter()
  const orgId = params.id as string

  const [org, setOrg] = useState<AdminOrgDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  // Form state
  const [planId, setPlanId] = useState('free')
  const [interval, setInterval] = useState('month')
  const [limit, setLimit] = useState('1000')
  const [periodEnd, setPeriodEnd] = useState('')

  useEffect(() => {
    if (orgId) {
      getAdminOrg(orgId)
        .then((data) => {
          setOrg({ ...data.billing, sites: data.sites })
          setPlanId(data.billing.plan_id)
          setInterval(data.billing.billing_interval || 'month')
          setLimit(data.billing.pageview_limit.toString())
          
          // Format date for input type="datetime-local" or similar
          if (data.billing.current_period_end) {
            setPeriodEnd(new Date(data.billing.current_period_end).toISOString().slice(0, 16))
          } else {
            // Default to 1 month from now
            setPeriodEnd(addMonths(new Date(), 1).toISOString().slice(0, 16))
          }
        })
        .catch(() => {
          toast.error('Failed to load organization')
          router.push('/admin/orgs')
        })
        .finally(() => setLoading(false))
    }
  }, [orgId, router])

  const handleGrantPlan = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!org) return

    setSubmitting(true)
    try {
      await grantPlan(org.organization_id, {
        plan_id: planId,
        billing_interval: interval,
        pageview_limit: parseInt(limit),
        period_end: new Date(periodEnd).toISOString(),
      })
      toast.success('Plan granted successfully')
      router.refresh()
      // Reload data to show updates
      const data = await getAdminOrg(orgId)
      setOrg({ ...data.billing, sites: data.sites })
    } catch (error) {
      toast.error('Failed to grant plan')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <LoadingOverlay logoSrc="/pulse_icon_no_margins.png" title="Loading organization..." />
  if (!org) return <div>Organization not found</div>

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-neutral-900 dark:text-white">
          {org.business_name || 'Unnamed Organization'}
        </h2>
        <span className="text-sm font-mono text-neutral-500">{org.organization_id}</span>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Current Status */}
        <Card>
          <CardHeader>
            <CardTitle>Current Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <span className="text-neutral-500">Plan:</span>
              <span className="font-medium">{org.plan_id}</span>
              
              <span className="text-neutral-500">Status:</span>
              <span className="font-medium">{org.subscription_status}</span>
              
              <span className="text-neutral-500">Limit:</span>
              <span className="font-medium">{new Intl.NumberFormat().format(org.pageview_limit)}</span>
              
              <span className="text-neutral-500">Interval:</span>
              <span className="font-medium">{org.billing_interval}</span>
              
              <span className="text-neutral-500">Period End:</span>
              <span className="font-medium">
                {org.current_period_end ? format(new Date(org.current_period_end), 'PPP p') : '-'}
              </span>

              <span className="text-neutral-500">Stripe Cust:</span>
              <span className="font-mono text-xs">{org.stripe_customer_id || '-'}</span>
              
              <span className="text-neutral-500">Stripe Sub:</span>
              <span className="font-mono text-xs">{org.stripe_subscription_id || '-'}</span>
            </div>
          </CardContent>
        </Card>

        {/* Sites */}
        <Card>
          <CardHeader>
            <CardTitle>Sites ({org.sites.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 max-h-60 overflow-y-auto">
              {org.sites.map((site) => (
                <li key={site.id} className="flex justify-between items-center text-sm p-2 bg-neutral-50 dark:bg-neutral-900 rounded">
                  <span className="font-medium">{site.domain}</span>
                  <span className="text-neutral-500 text-xs">{format(new Date(site.created_at), 'MMM d, yyyy')}</span>
                </li>
              ))}
              {org.sites.length === 0 && <li className="text-neutral-500 text-sm">No sites found</li>}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Grant Plan Form */}
      <Card>
        <CardHeader>
          <CardTitle>Grant Plan (Manual Override)</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleGrantPlan} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Plan Tier</label>
                <Select
                  value={planId}
                  onChange={setPlanId}
                  options={PLAN_OPTIONS}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Billing Interval</label>
                <Select
                  value={interval}
                  onChange={setInterval}
                  options={INTERVAL_OPTIONS}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Pageview Limit</label>
                <Select
                  value={limit}
                  onChange={setLimit}
                  options={LIMIT_OPTIONS}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Period End Date (UTC)</label>
                <input
                  type="datetime-local"
                  value={periodEnd}
                  onChange={(e) => setPeriodEnd(e.target.value)}
                  className="w-full px-4 py-2 border border-neutral-200 dark:border-neutral-800 rounded-lg bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-orange focus:ring-offset-2"
                  required
                />
                <div className="flex gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => setPeriodEnd(addMonths(new Date(), 1).toISOString().slice(0, 16))}
                    className="text-xs text-blue-500 hover:underline"
                  >
                    +1 Month
                  </button>
                  <button
                    type="button"
                    onClick={() => setPeriodEnd(addYears(new Date(), 1).toISOString().slice(0, 16))}
                    className="text-xs text-blue-500 hover:underline"
                  >
                    +1 Year
                  </button>
                  <button
                    type="button"
                    onClick={() => setPeriodEnd(addYears(new Date(), 100).toISOString().slice(0, 16))}
                    className="text-xs text-blue-500 hover:underline"
                  >
                    Forever
                  </button>
                </div>
              </div>
            </div>

            <div className="pt-4 flex justify-end">
              <Button type="submit" disabled={submitting} variant="primary">
                {submitting ? 'Granting...' : 'Grant Plan'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
