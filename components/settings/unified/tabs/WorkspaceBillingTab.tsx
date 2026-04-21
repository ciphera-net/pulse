'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button, toast, Spinner, Modal } from '@ciphera-net/ui'
import { CreditCard, ArrowSquareOut, DownloadSimple } from '@phosphor-icons/react'
import { useSubscription } from '@/lib/swr/dashboard'
import { useUnifiedSettings } from '@/lib/unified-settings-context'
import { updatePaymentMethod, cancelSubscription, resumeSubscription, getInvoices, downloadInvoicePDF, type Invoice } from '@/lib/api/billing'
import { formatDateLong, formatDate } from '@/lib/utils/formatDate'
import { getAuthErrorMessage } from '@ciphera-net/ui'

export default function WorkspaceBillingTab() {
  const router = useRouter()
  const { closeUnifiedSettings } = useUnifiedSettings()
  const { data: subscription, isLoading, mutate } = useSubscription()
  const [cancelling, setCancelling] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [invoices, setInvoices] = useState<Invoice[]>([])

  useEffect(() => {
    getInvoices().then(setInvoices).catch(() => {})
  }, [])

  const handleManageBilling = async () => {
    try {
      const { url } = await updatePaymentMethod()
      if (url) window.location.href = url
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || 'Failed to update payment method')
    }
  }

  const handleCancel = async () => {
    setCancelling(true)
    try {
      await cancelSubscription()
      await mutate()
      toast.success('Subscription cancelled')
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || 'Failed to cancel subscription')
    } finally {
      setCancelling(false)
      setShowCancelConfirm(false)
    }
  }

  const handleResume = async () => {
    try {
      await resumeSubscription()
      await mutate()
      toast.success('Subscription resumed')
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || 'Failed to resume subscription')
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="w-6 h-6 text-neutral-500" />
      </div>
    )
  }

  if (!subscription) {
    return (
      <div className="text-center py-12">
        <CreditCard className="w-10 h-10 text-neutral-500 mx-auto mb-3" />
        <h3 className="text-base font-semibold text-white mb-1">No subscription</h3>
        <p className="text-sm text-neutral-400 mb-4">You're on the Hobby plan.</p>
        <Button variant="primary" className="text-sm" onClick={() => { closeUnifiedSettings(); router.push('/pricing'); }}>View Plans</Button>
      </div>
    )
  }

  const planLabel = (() => {
    const raw = subscription.plan_id?.startsWith('price_') ? 'Pro'
      : subscription.plan_id === 'free' || !subscription.plan_id ? 'Hobby'
      : subscription.plan_id
    return raw === 'Free' || raw === 'Pro' ? raw : raw.charAt(0).toUpperCase() + raw.slice(1)
  })()

  const isActive = subscription.subscription_status === 'active' || subscription.subscription_status === 'trialing'

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-white mb-1">Billing & Subscription</h3>
        <p className="text-sm text-neutral-400">Manage your plan, usage, and payment details.</p>
      </div>

      {/* Plan card */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-800/30 p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h4 className="text-lg font-bold text-white">{planLabel} Plan</h4>
            {isActive && (
              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-900/30 text-green-400 border border-green-900/50">
                Active
              </span>
            )}
            {subscription.cancel_at_period_end && (
              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-yellow-900/30 text-yellow-400 border border-yellow-900/50">
                Cancelling
              </span>
            )}
          </div>
          <Button variant="primary" className="text-sm" onClick={() => { closeUnifiedSettings(); router.push('/pricing'); }}>Change Plan</Button>
        </div>

        {/* Usage stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {typeof subscription.sites_count === 'number' && (
            <div>
              <p className="text-xs text-neutral-500 uppercase tracking-wider">Sites</p>
              <p className="text-lg font-semibold text-white">{subscription.sites_count}</p>
            </div>
          )}
          {subscription.pageview_limit > 0 && typeof subscription.pageview_usage === 'number' && (
            <div>
              <p className="text-xs text-neutral-500 uppercase tracking-wider">Pageviews</p>
              <p className="text-lg font-semibold text-white">{subscription.pageview_usage.toLocaleString()} / {subscription.pageview_limit.toLocaleString()}</p>
            </div>
          )}
          {subscription.current_period_end && (
            <div>
              <p className="text-xs text-neutral-500 uppercase tracking-wider">
                {subscription.cancel_at_period_end ? 'Ends' : 'Renews'}
              </p>
              <p className="text-lg font-semibold text-white">{formatDateLong(new Date(subscription.current_period_end))}</p>
            </div>
          )}
          {subscription.pageview_limit > 0 && (
            <div>
              <p className="text-xs text-neutral-500 uppercase tracking-wider">Limit</p>
              <p className="text-lg font-semibold text-white">{subscription.pageview_limit.toLocaleString()} / mo</p>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <Button onClick={handleManageBilling} variant="secondary" className="text-sm gap-1.5">
          <ArrowSquareOut weight="bold" className="w-3.5 h-3.5" />
          Update payment method
        </Button>

        {isActive && !subscription.cancel_at_period_end && (
          <Button
            onClick={() => setShowCancelConfirm(true)}
            variant="secondary"
            className="text-sm text-neutral-400 hover:text-red-400"
          >
            Cancel subscription
          </Button>
        )}

        {subscription.cancel_at_period_end && (
          <Button onClick={handleResume} variant="secondary" className="text-sm text-brand-orange">
            Resume subscription
          </Button>
        )}
      </div>

      {/* Cancel confirmation */}
      <Modal isOpen={showCancelConfirm} onClose={() => setShowCancelConfirm(false)} title="Cancel subscription" className="max-w-md">
        <p className="text-sm text-neutral-400 mb-1">
          Are you sure you want to cancel your subscription?
        </p>
        {subscription.current_period_end && (
          <p className="text-sm text-neutral-500 mb-5">
            Your plan will remain active until {formatDateLong(new Date(subscription.current_period_end))}.
          </p>
        )}
        <div className="flex justify-end gap-3">
          <Button variant="secondary" className="text-sm" onClick={() => setShowCancelConfirm(false)} disabled={cancelling}>
            Keep plan
          </Button>
          <Button
            variant="primary"
            className="text-sm bg-red-600 hover:bg-red-700 border-red-600 hover:border-red-700"
            onClick={handleCancel}
            disabled={cancelling}
          >
            {cancelling ? 'Cancelling...' : 'Yes, cancel'}
          </Button>
        </div>
      </Modal>

      {/* Recent Invoices */}
      {invoices.length > 0 && (
        <div className="space-y-2 pt-6 border-t border-neutral-800">
          <h4 className="text-sm font-medium text-neutral-300">Recent Invoices</h4>
          <div className="space-y-1">
            {invoices.map(invoice => (
              <div key={invoice.id} className="flex items-center justify-between p-3 rounded-lg border border-neutral-800 text-sm">
                <div className="flex items-center gap-3">
                  <span className="text-neutral-400 font-mono text-xs">{invoice.invoice_number ?? '—'}</span>
                  <span className="text-neutral-300">{formatDate(new Date(invoice.created_at))}</span>
                  <span className="text-white font-medium">
                    {new Intl.NumberFormat('en-GB', { style: 'currency', currency: invoice.currency || 'EUR' }).format(invoice.total_cents / 100)}
                  </span>
                  <span className="text-neutral-500 text-xs">
                    (incl. {new Intl.NumberFormat('en-GB', { style: 'currency', currency: invoice.currency || 'EUR' }).format(invoice.vat_cents / 100)} VAT)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${invoice.status === 'sent' ? 'bg-green-900/30 text-green-400' : 'bg-neutral-800 text-neutral-400'}`}>
                    {invoice.status === 'sent' ? 'Paid' : invoice.status}
                  </span>
                  <button
                    onClick={() => downloadInvoicePDF(invoice.id).catch(() => toast.error('PDF not available yet'))}
                    className="p-1.5 rounded-md hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors ease-apple"
                    title="Download PDF"
                  >
                    <DownloadSimple size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
