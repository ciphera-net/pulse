'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button, toast, Spinner, Modal } from '@ciphera-net/ui'
import { CreditCard, DownloadSimple, ArrowRight, WarningCircle, PencilSimple } from '@phosphor-icons/react'
import { useSubscription } from '@/lib/swr/dashboard'
import { useUnifiedSettings } from '@/lib/unified-settings-context'
import { updatePaymentMethod, cancelSubscription, resumeSubscription, getInvoices, downloadInvoicePDF, updateBillingSettings, type Invoice } from '@/lib/api/billing'
import { formatDateLong, formatDate } from '@/lib/utils/formatDate'
import { getAuthErrorMessage } from '@ciphera-net/ui'

export default function WorkspaceBillingTab() {
  const router = useRouter()
  const { closeUnifiedSettings } = useUnifiedSettings()
  const { data: subscription, isLoading, mutate } = useSubscription()
  const [cancelling, setCancelling] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [editingBilling, setEditingBilling] = useState(false)
  const [savingBilling, setSavingBilling] = useState(false)
  const [billingForm, setBillingForm] = useState({ business_name: '', billing_email: '', address: '', city: '', postal_code: '' })

  useEffect(() => {
    getInvoices().then(setInvoices).catch(() => {})
  }, [])

  const handleUpdatePayment = async () => {
    try {
      const { url } = await updatePaymentMethod()
      window.location.href = url
    } catch {
      toast.error('Failed to open payment portal')
    }
  }

  const handleCancel = async () => {
    setCancelling(true)
    try {
      await cancelSubscription()
      if (subscription) {
        await mutate({ ...subscription, cancel_at_period_end: true }, { revalidate: false })
      }
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
      const result = await resumeSubscription()
      if (result.requires_checkout) {
        closeUnifiedSettings()
        router.push('/setup/plan')
        toast.success('Your subscription has expired. Please subscribe again.')
        return
      }
      if (subscription) {
        await mutate({ ...subscription, cancel_at_period_end: false }, { revalidate: false })
      }
      toast.success('Subscription resumed')
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || 'Failed to resume subscription')
    }
  }

  const handleEditBilling = () => {
    setBillingForm({
      business_name: subscription?.business_name ?? '',
      billing_email: subscription?.billing_email ?? '',
      address: subscription?.billing_address ?? '',
      city: subscription?.billing_city ?? '',
      postal_code: subscription?.billing_postal_code ?? '',
    })
    setEditingBilling(true)
  }

  const handleSaveBilling = async () => {
    setSavingBilling(true)
    try {
      const result = await updateBillingSettings({
        billing_email: billingForm.billing_email,
        business_name: billingForm.business_name,
        address: billingForm.address,
        city: billingForm.city,
        postal_code: billingForm.postal_code,
      })
      if (result.ok) {
        await mutate()
        setEditingBilling(false)
        toast.success('Billing details updated')
      }
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || 'Failed to update billing details')
    } finally {
      setSavingBilling(false)
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
        <Button variant="primary" className="text-sm" onClick={() => { closeUnifiedSettings(); router.push('/switch'); }}>View Plans</Button>
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
  const isCanceled = subscription.subscription_status === 'canceled'

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
            {isActive && !subscription.cancel_at_period_end && (
              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-900/30 text-green-400 border border-green-900/50">
                Active
              </span>
            )}
            {subscription.subscription_status === 'canceled' && (
              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-900/30 text-red-400 border border-red-900/50">
                Cancelled
              </span>
            )}
            {subscription.cancel_at_period_end && subscription.subscription_status !== 'canceled' && (
              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-yellow-900/30 text-yellow-400 border border-yellow-900/50">
                Cancelling
              </span>
            )}
          </div>
          <Button variant="primary" className="text-sm" onClick={() => { closeUnifiedSettings(); router.push(isCanceled ? '/setup/plan' : '/switch'); }}>
            {isCanceled ? 'Resubscribe' : 'Change Plan'}
          </Button>
        </div>

        {isCanceled ? (
          <div className="flex items-start gap-3 p-3 rounded-lg bg-red-900/20 border border-red-900/40 text-sm">
            <WarningCircle size={16} weight="fill" className="text-red-400 shrink-0 mt-0.5" />
            <p className="text-red-300">
              Your {planLabel} plan has expired. You&apos;re now limited to 5,000 pageviews/month on the free tier.
            </p>
          </div>
        ) : (
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
        )}
      </div>

      {/* Account credit */}
      {subscription.credit_balance != null && subscription.credit_balance > 0 && (
        <div className="rounded-lg border border-green-500/20 bg-green-500/5 px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-green-400">Account credit</p>
            <p className="text-xs text-neutral-500">Automatically applied to your next invoice</p>
          </div>
          <p className="text-lg font-semibold text-green-400">&euro;{(subscription.credit_balance / 100).toFixed(2)}</p>
        </div>
      )}

      {/* Pending plan change notice */}
      {subscription.pending_plan_id && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-900/20 border border-blue-900/40 text-sm mt-4">
          <ArrowRight size={16} className="text-blue-400 shrink-0" />
          <p className="text-blue-300">
            Switching to <span className="font-semibold text-white">{subscription.pending_plan_id.charAt(0).toUpperCase() + subscription.pending_plan_id.slice(1)} Plan</span>
            {subscription.pending_limit ? ` (${subscription.pending_limit.toLocaleString()} pageviews/${subscription.pending_interval === 'month' ? 'mo' : 'yr'})` : ''}
            {subscription.current_period_end ? ` on ${formatDateLong(new Date(subscription.current_period_end))}` : ''}
          </p>
        </div>
      )}

      {subscription.payment_failed_at && (
        <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-900/20 border border-amber-900/40 text-sm mt-4">
          <WarningCircle size={16} weight="fill" className="text-amber-400 shrink-0 mt-0.5" />
          <p className="text-amber-300">
            Your last payment could not be processed. Please{' '}
            <button onClick={handleUpdatePayment} className="underline font-medium text-amber-200 hover:text-white">
              update your payment method
            </button>{' '}
            to avoid service interruption.
          </p>
        </div>
      )}

      {/* Actions */}
      {!isCanceled && (
        <div className="flex flex-wrap gap-3">
          <Button onClick={handleUpdatePayment} variant="secondary" className="text-sm gap-1.5">
            <CreditCard weight="bold" className="w-3.5 h-3.5" />
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
      )}

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

      {/* Billing Details */}
      {subscription.billing_email && (
        <div className="space-y-3 pt-6 border-t border-neutral-800">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-neutral-300">Billing Details</h4>
            {!editingBilling && (
              <button
                onClick={handleEditBilling}
                className="p-1.5 rounded-md hover:bg-neutral-800 text-neutral-500 hover:text-neutral-300 transition-colors"
                title="Edit billing details"
              >
                <PencilSimple size={14} />
              </button>
            )}
          </div>

          {editingBilling ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-neutral-500">Business name</label>
                  <input
                    type="text"
                    value={billingForm.business_name}
                    onChange={e => setBillingForm(f => ({ ...f, business_name: e.target.value }))}
                    className="bg-neutral-800/50 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-brand-orange"
                    placeholder="Business name"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-neutral-500">Billing email</label>
                  <input
                    type="email"
                    value={billingForm.billing_email}
                    onChange={e => setBillingForm(f => ({ ...f, billing_email: e.target.value }))}
                    className="bg-neutral-800/50 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-brand-orange"
                    placeholder="billing@example.com"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-neutral-500">Address</label>
                  <input
                    type="text"
                    value={billingForm.address}
                    onChange={e => setBillingForm(f => ({ ...f, address: e.target.value }))}
                    className="bg-neutral-800/50 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-brand-orange"
                    placeholder="Street address"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-neutral-500">City</label>
                  <input
                    type="text"
                    value={billingForm.city}
                    onChange={e => setBillingForm(f => ({ ...f, city: e.target.value }))}
                    className="bg-neutral-800/50 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-brand-orange"
                    placeholder="City"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-neutral-500">Postal code</label>
                  <input
                    type="text"
                    value={billingForm.postal_code}
                    onChange={e => setBillingForm(f => ({ ...f, postal_code: e.target.value }))}
                    className="bg-neutral-800/50 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-brand-orange"
                    placeholder="Postal code"
                  />
                </div>
              </div>

              {subscription.tax_id && (
                <p className="text-xs text-neutral-500">
                  To change your country or VAT ID, please contact support.
                </p>
              )}

              <div className="flex gap-2">
                <Button variant="primary" className="text-sm" onClick={handleSaveBilling} disabled={savingBilling}>
                  {savingBilling ? 'Saving...' : 'Save'}
                </Button>
                <Button variant="secondary" className="text-sm" onClick={() => setEditingBilling(false)} disabled={savingBilling}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              {subscription.business_name && (
                <>
                  <span className="text-neutral-500">Business name</span>
                  <span className="text-neutral-300">{subscription.business_name}</span>
                </>
              )}
              <span className="text-neutral-500">Email</span>
              <span className="text-neutral-300">{subscription.billing_email}</span>
              {subscription.billing_address && (
                <>
                  <span className="text-neutral-500">Address</span>
                  <span className="text-neutral-300">
                    {subscription.billing_address}
                    {subscription.billing_postal_code ? `, ${subscription.billing_postal_code}` : ''}
                    {subscription.billing_city ? ` ${subscription.billing_city}` : ''}
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Recent Invoices */}
      {invoices.length > 0 && (
        <div className="space-y-2 pt-6 border-t border-neutral-800">
          <h4 className="text-sm font-medium text-neutral-300">Recent Invoices</h4>
          <div className="space-y-1">
            {invoices.map(invoice => {
              const isCreditNote = invoice.document_type === 'credit_note'
              const fmt = new Intl.NumberFormat('en-GB', { style: 'currency', currency: invoice.currency || 'EUR' })
              return (
                <div key={invoice.id} className="flex items-center justify-between p-3 rounded-lg border border-neutral-800 text-sm">
                  <div className="flex items-center gap-3">
                    <span className="text-neutral-400 font-mono text-xs">{invoice.invoice_number ?? '—'}</span>
                    <span className="text-neutral-300">{formatDate(new Date(invoice.created_at))}</span>
                    <span className={`font-medium ${isCreditNote ? 'text-blue-400' : 'text-white'}`}>
                      {isCreditNote ? '−' : ''}{fmt.format(Math.abs(invoice.total_cents) / 100)}
                    </span>
                    <span className="text-neutral-500 text-xs">
                      ({isCreditNote ? 'refund' : 'incl.'} {fmt.format(Math.abs(invoice.vat_cents) / 100)} VAT)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {isCreditNote ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-900/30 text-blue-400">
                        Credit Note
                      </span>
                    ) : (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${invoice.status === 'sent' ? 'bg-green-900/30 text-green-400' : 'bg-neutral-800 text-neutral-400'}`}>
                        {invoice.status === 'sent' ? 'Paid' : invoice.status}
                      </span>
                    )}
                    <button
                      onClick={() => downloadInvoicePDF(invoice.id).catch(() => toast.error('PDF not available yet'))}
                      className="p-1.5 rounded-md hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors ease-apple"
                      title="Download PDF"
                    >
                      <DownloadSimple size={16} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
