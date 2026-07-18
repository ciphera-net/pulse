'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { Button, Input, toast, Spinner, Modal } from '@ciphera-net/facet'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { CreditCard, DownloadSimple, ArrowRight, WarningCircle, PencilSimple } from '@phosphor-icons/react'
import { useSubscription } from '@/lib/swr/dashboard'
import { updatePaymentMethod, cancelSubscription, resumeSubscription, getInvoices, getPrices, downloadInvoicePDF, updateBillingSettings } from '@/lib/api/billing'
import { formatDate, formatDateFull } from '@/lib/utils/formatDate'
import { getAuthErrorMessage } from '@ciphera-net/facet'
import { cdnUrl } from '@/lib/cdn'
import { useCan } from '@/lib/auth/permissions'
import { formatPlanName, getPlanPricing, FREE_PAGEVIEW_LIMIT } from '@/lib/plans'

const euro = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR' })

const PAYMENT_METHODS = [
  { id: 'creditcard', label: 'Cards', icons: ['/icons/payment/visa.svg', '/icons/payment/mastercard.svg'] },
  { id: 'bancontact', label: 'Bancontact', icons: ['/icons/payment/bancontact.svg'] },
  { id: 'directdebit', label: 'SEPA', icons: ['/icons/payment/sepa.svg'] },
  { id: 'ideal', label: 'iDEAL', icons: ['/icons/payment/ideal.svg'] },
  { id: 'applepay', label: 'Apple Pay', icons: ['/icons/payment/applepay.svg'] },
]

export default function WorkspaceBillingTab() {
  const router = useRouter()
  const canManageBilling = useCan('billing.manage')
  const { data: subscription, isLoading, mutate } = useSubscription()
  const [cancelling, setCancelling] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [showPaymentMethodModal, setShowPaymentMethodModal] = useState(false)
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('')
  const methodRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [editingBilling, setEditingBilling] = useState(false)
  const [savingBilling, setSavingBilling] = useState(false)
  const [billingForm, setBillingForm] = useState({ business_name: '', billing_email: '', address: '', city: '', postal_code: '' })

  // SWR (matching useSubscription) so loading, empty, and error are three
  // distinguishable states — the old effect+state version rendered nothing
  // for both "still fetching" and "no invoices ever".
  const {
    data: invoices,
    error: invoicesFetchError,
    isLoading: invoicesLoading,
    mutate: retryInvoices,
  } = useSWR('billing-invoices', getInvoices)
  const invoicesError = invoicesFetchError
    ? getAuthErrorMessage(invoicesFetchError as Error) || 'Failed to load invoices'
    : null

  const { data: prices } = useSWR('plan-prices', getPrices)

  // Return params from the Mollie payment-method update flow (redirectUrl /
  // cancelUrl land here) — acknowledge the outcome instead of a silent reload.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('payment_updated') === 'true') {
      toast.success('Payment method updated')
      mutate()
    } else if (params.get('payment_update_canceled') === 'true') {
      toast.info('Payment method update canceled.')
    } else {
      return
    }
    window.history.replaceState({}, '', window.location.pathname)
  }, [mutate])

  const handleUpdatePayment = async (method: string) => {
    try {
      const { url } = await updatePaymentMethod(method)
      window.location.href = url
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || 'Failed to open payment portal')
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
        toast.warning('Your subscription has expired. Please subscribe again.')
        router.push('/setup/plan')
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

  const onMethodKeyDown = (e: React.KeyboardEvent, index: number) => {
    let target: number | null = null
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') target = (index + 1) % PAYMENT_METHODS.length
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') target = (index - 1 + PAYMENT_METHODS.length) % PAYMENT_METHODS.length
    if (target === null) return
    e.preventDefault()
    setSelectedPaymentMethod(PAYMENT_METHODS[target].id)
    methodRefs.current[target]?.focus()
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
        <Button variant="default" className="text-sm" onClick={() => router.push('/setup/plan')}>View Plans</Button>
      </div>
    )
  }

  const planLabel = formatPlanName(subscription.plan_id)

  const isActive = subscription.subscription_status === 'active' || subscription.subscription_status === 'trialing'
  const isTrialing = subscription.subscription_status === 'trialing'
  const isCanceled = subscription.subscription_status === 'canceled'
  const isPastDue = subscription.subscription_status === 'past_due'
  // Hobby/free orgs have a subscription row but no live Mollie subscription —
  // payment-method and cancel actions would only error for them.
  const isFree = subscription.plan_id === 'free' && subscription.subscription_status === ''

  const planPricing = getPlanPricing(prices, subscription.plan_id, subscription.pageview_limit)
  const isYearlyInterval = subscription.billing_interval === 'year'

  const overLimit =
    subscription.pageview_limit > 0 &&
    typeof subscription.pageview_usage === 'number' &&
    subscription.pageview_usage > subscription.pageview_limit

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-white mb-1">Billing & Subscription</h3>
        <p className="text-sm text-neutral-400">Manage your plan, usage, and payment details.</p>
      </div>

      {/* Plan card */}
      <div className="rounded-none border border-neutral-800 bg-neutral-800/30 p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h4 className="text-lg font-bold text-white">{planLabel} Plan</h4>
            {isActive && !isTrialing && !subscription.cancel_at_period_end && (
              <span className="px-2 py-0.5 text-xs font-medium rounded-none bg-green-900/30 text-green-400 border border-green-900/50">
                Active
              </span>
            )}
            {isTrialing && !subscription.cancel_at_period_end && (
              <span className="px-2 py-0.5 text-xs font-medium rounded-none bg-blue-900/30 text-blue-400 border border-blue-900/50">
                Trial
              </span>
            )}
            {subscription.subscription_status === 'canceled' && (
              <span className="px-2 py-0.5 text-xs font-medium rounded-none bg-red-900/30 text-red-400 border border-red-900/50">
                Cancelled
              </span>
            )}
            {subscription.cancel_at_period_end && subscription.subscription_status !== 'canceled' && (
              <span className="px-2 py-0.5 text-xs font-medium rounded-none bg-yellow-900/30 text-yellow-400 border border-yellow-900/50">
                Cancelling
              </span>
            )}
            {isPastDue && (
              <span className="px-2 py-0.5 text-xs font-medium rounded-none bg-amber-900/30 text-amber-400 border border-amber-900/50">
                Past due
              </span>
            )}
          </div>
          {canManageBilling ? (
            // In past_due, "Change Plan" routes to /switch which bounces (the
            // switch guard requires an active/trialing subscription). Hide it —
            // the Update-payment-method CTA below is the correct action here.
            isPastDue ? null : (
              <Button
                variant="default"
                className="text-sm"
                onClick={() => router.push(isCanceled || isFree ? '/setup/plan' : '/switch')}
              >
                {isCanceled ? 'Resubscribe' : isFree ? 'Upgrade' : 'Change Plan'}
              </Button>
            )
          ) : (
            <p className="text-xs text-neutral-500">Only the workspace owner can modify billing.</p>
          )}
        </div>

        {isCanceled ? (
          <div className="flex items-start gap-3 p-3 rounded-none bg-red-900/20 border border-red-900/40 text-sm">
            <WarningCircle size={16} weight="fill" className="text-red-400 shrink-0 mt-0.5" />
            <p className="text-red-300">
              Your {planLabel} plan has expired. You&apos;re now limited to {FREE_PAGEVIEW_LIMIT.toLocaleString()} pageviews/month on the free tier.
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
                <div className="mt-2 h-1.5 w-full max-w-[160px] bg-neutral-800 rounded-none overflow-hidden">
                  <div
                    className={`h-full ${subscription.pageview_usage / subscription.pageview_limit >= 0.9 ? 'bg-red-500' : 'bg-brand-orange'}`}
                    style={{ width: `${Math.min(100, (subscription.pageview_usage / subscription.pageview_limit) * 100)}%` }}
                  />
                </div>
              </div>
            )}
            {subscription.current_period_end && (
              <div>
                <p className="text-xs text-neutral-500 uppercase tracking-wider">
                  {subscription.cancel_at_period_end ? 'Ends' : isTrialing ? 'Trial ends' : 'Renews'}
                </p>
                <p className="text-lg font-semibold text-white">{formatDateFull(new Date(subscription.current_period_end))}</p>
              </div>
            )}
            {planPricing && !isFree ? (
              <div>
                <p className="text-xs text-neutral-500 uppercase tracking-wider">Price</p>
                <p className="text-lg font-semibold text-white">
                  {isYearlyInterval ? `€${planPricing.yearlyTotal}/yr` : `€${planPricing.monthly}/mo`}
                </p>
                <p className="text-xs text-neutral-500 mt-0.5">
                  excl. VAT{isYearlyInterval ? ` · €${planPricing.effectiveMonthly}/mo` : ''}
                </p>
              </div>
            ) : subscription.pageview_limit > 0 && (
              // Legacy plan ids have no entry in the prices map — fall back to
              // the limit rather than showing an empty cell.
              <div>
                <p className="text-xs text-neutral-500 uppercase tracking-wider">Limit</p>
                <p className="text-lg font-semibold text-white">{subscription.pageview_limit.toLocaleString()} / mo</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Over-limit usage warning */}
      {!isCanceled && overLimit && (
        <div className="flex items-start gap-3 p-3 rounded-none bg-amber-900/20 border border-amber-900/40 text-sm mt-4">
          <WarningCircle size={16} weight="fill" className="text-amber-400 shrink-0 mt-0.5" />
          <p className="text-amber-300">
            You&apos;ve exceeded your monthly pageview limit ({subscription.pageview_usage!.toLocaleString()} of {subscription.pageview_limit.toLocaleString()}).{' '}
            {canManageBilling ? (
              <button onClick={() => router.push('/switch')} className="underline font-medium text-amber-200 hover:text-white">
                Upgrade your plan
              </button>
            ) : (
              'Contact your workspace owner to upgrade the plan.'
            )}
            {canManageBilling ? ' to keep collecting data.' : ''}
          </p>
        </div>
      )}

      {/* Account credit */}
      {subscription.credit_balance != null && subscription.credit_balance > 0 && (
        <div className="rounded-none border border-green-500/20 bg-green-500/5 px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-green-400">Account credit</p>
            <p className="text-xs text-neutral-500">Automatically applied to your next invoice</p>
          </div>
          <p className="text-lg font-semibold text-green-400">{euro.format(subscription.credit_balance / 100)}</p>
        </div>
      )}

      {/* Pending plan change notice */}
      {subscription.pending_plan_id && (
        <div className="flex items-center gap-3 p-3 rounded-none bg-blue-900/20 border border-blue-900/40 text-sm mt-4">
          <ArrowRight size={16} className="text-blue-400 shrink-0" />
          <p className="text-blue-300">
            Plan change to <span className="font-semibold text-white">{formatPlanName(subscription.pending_plan_id)}</span>
            {subscription.pending_limit ? ` (${subscription.pending_limit.toLocaleString()} pageviews/${subscription.pending_interval === 'month' ? 'mo' : 'yr'})` : ''}
            {' '}pending
            {subscription.current_period_end ? ` — applies ${formatDateFull(new Date(subscription.current_period_end))}` : ''}
          </p>
        </div>
      )}

      {/* One payment-trouble banner: past_due (plan at risk) or a softer
          payment-failed warning while the subscription is still active. */}
      {(isPastDue || subscription.payment_failed_at) && (
        <div className="flex items-start gap-3 p-3 rounded-none bg-amber-900/20 border border-amber-900/40 text-sm mt-4">
          <WarningCircle size={16} weight="fill" className="text-amber-400 shrink-0 mt-0.5" />
          <p className="text-amber-300">
            {isPastDue
              ? 'Payment past due — update your payment method to keep your plan.'
              : 'Your last payment could not be processed.'}{' '}
            {canManageBilling ? (
              <>
                <button onClick={() => { setSelectedPaymentMethod(''); setShowPaymentMethodModal(true) }} className="underline font-medium text-amber-200 hover:text-white">
                  Update payment method
                </button>
                {!isPastDue && ' to avoid service interruption.'}
              </>
            ) : (
              'Please contact your workspace owner to update the payment method.'
            )}
          </p>
        </div>
      )}

      {/* Actions — hidden for Hobby/free: there is no Mollie customer or
          subscription behind them, so both calls would only error. */}
      {!isCanceled && !isFree && canManageBilling && (
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => { setSelectedPaymentMethod(''); setShowPaymentMethodModal(true) }} variant="secondary" className="text-sm gap-1.5">
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

      {/* Payment method selection */}
      <Modal isOpen={showPaymentMethodModal} onClose={() => setShowPaymentMethodModal(false)} title="Choose payment method" className="max-w-sm">
        <div role="radiogroup" aria-label="Payment method" className="grid grid-cols-3 gap-2 mb-4">
          {PAYMENT_METHODS.map((method, i) => {
            const selected = selectedPaymentMethod === method.id
            const isTabStop = selected || (!selectedPaymentMethod && i === 0)
            return (
              <button
                key={method.id}
                ref={(el) => { methodRefs.current[i] = el }}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={method.label}
                tabIndex={isTabStop ? 0 : -1}
                onClick={() => setSelectedPaymentMethod(method.id)}
                onKeyDown={(e) => onMethodKeyDown(e, i)}
                className={`flex flex-col items-center justify-center gap-1.5 rounded-none border h-[60px] text-xs transition-all duration-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-orange ${
                  selected
                    ? 'border-brand-orange bg-brand-orange/5 text-white'
                    : 'border-neutral-700/50 bg-neutral-800/30 text-neutral-400 hover:border-neutral-600'
                } ease-apple`}
              >
                <div className="flex items-center gap-1 bg-white rounded-none px-1.5 py-1">
                  {method.icons.map((icon) => (
                    <img key={icon} src={cdnUrl(icon)} alt="" className="h-5 w-auto" />
                  ))}
                </div>
                {method.label}
              </button>
            )
          })}
        </div>
        <Button
          variant="default"
          className="w-full text-sm"
          onClick={() => { setShowPaymentMethodModal(false); handleUpdatePayment(selectedPaymentMethod) }}
          disabled={!selectedPaymentMethod}
        >
          Continue
        </Button>
      </Modal>

      {/* Cancel confirmation */}
      <Modal isOpen={showCancelConfirm} onClose={() => setShowCancelConfirm(false)} title="Cancel subscription" className="max-w-md">
        <p className="text-sm text-neutral-400 mb-3">
          Are you sure you want to cancel your subscription?
        </p>
        <p className="text-sm text-neutral-500 mb-1">
          {subscription.current_period_end
            ? <>Your {planLabel} plan stays fully active until <span className="text-neutral-300">{formatDateFull(new Date(subscription.current_period_end))}</span> — you won&apos;t be charged again.</>
            : <>You&apos;ll keep access until the end of your current billing period and won&apos;t be charged again.</>}
        </p>
        <p className="text-sm text-neutral-500 mb-5">
          After that, your workspace moves to the free Hobby plan ({FREE_PAGEVIEW_LIMIT.toLocaleString()} pageviews/month, 1 site). Your data stays in place.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" className="text-sm" onClick={() => setShowCancelConfirm(false)} disabled={cancelling}>
            Keep plan
          </Button>
          <Button
            variant="default"
            className="text-sm bg-red-600 hover:bg-red-700 border-red-600 hover:border-red-700"
            onClick={handleCancel}
            disabled={cancelling}
          >
            {cancelling ? 'Cancelling...' : 'Yes, cancel'}
          </Button>
        </div>
      </Modal>

      {/* Billing Details — also rendered (as an add-details empty state) when
          the billing email hasn't synced yet, so managers are never locked out
          of entering details the API fully supports. */}
      {(subscription.billing_email || (canManageBilling && !isFree)) && (
        <div className="space-y-3 pt-6 border-t border-neutral-800">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-neutral-300">Billing Details</h4>
            {!editingBilling && canManageBilling && subscription.billing_email && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={handleEditBilling}
                      className="p-1.5 rounded-none hover:bg-neutral-800 text-neutral-500 hover:text-neutral-300 transition-colors"
                    >
                      <PencilSimple size={14} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Edit billing</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>

          {editingBilling ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-neutral-400">Business name</label>
                  <Input
                    type="text"
                    value={billingForm.business_name}
                    onChange={e => setBillingForm(f => ({ ...f, business_name: e.target.value }))}
                    placeholder="Business name"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-neutral-400">Billing email</label>
                  <Input
                    type="email"
                    value={billingForm.billing_email}
                    onChange={e => setBillingForm(f => ({ ...f, billing_email: e.target.value }))}
                    placeholder="billing@example.com"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-neutral-400">Address</label>
                  <Input
                    type="text"
                    value={billingForm.address}
                    onChange={e => setBillingForm(f => ({ ...f, address: e.target.value }))}
                    placeholder="Street address"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-neutral-400">City</label>
                  <Input
                    type="text"
                    value={billingForm.city}
                    onChange={e => setBillingForm(f => ({ ...f, city: e.target.value }))}
                    placeholder="City"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-neutral-400">Postal code</label>
                  <Input
                    type="text"
                    value={billingForm.postal_code}
                    onChange={e => setBillingForm(f => ({ ...f, postal_code: e.target.value }))}
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
                <Button variant="default" className="text-sm" onClick={handleSaveBilling} disabled={savingBilling}>
                  {savingBilling ? 'Saving...' : 'Save'}
                </Button>
                <Button variant="secondary" className="text-sm" onClick={() => setEditingBilling(false)} disabled={savingBilling}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : subscription.billing_email ? (
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
          ) : (
            <div className="flex items-center justify-between rounded-none border border-neutral-800 bg-neutral-800/30 px-4 py-3">
              <p className="text-sm text-neutral-500">No billing details on file yet.</p>
              <Button variant="secondary" className="text-sm" onClick={handleEditBilling}>
                Add billing details
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Recent Invoices */}
      <div className="pt-6 border-t border-neutral-800 space-y-2">
        <h4 className="text-sm font-medium text-neutral-300">Recent Invoices</h4>
        {invoicesError ? (
          <div className="rounded-none border border-red-900/50 bg-red-950/20 p-6 text-center">
            <p className="text-red-400 text-sm mb-4">{invoicesError}</p>
            <Button variant="secondary" onClick={() => retryInvoices()}>Retry</Button>
          </div>
        ) : invoicesLoading ? (
          <div className="flex items-center gap-3 rounded-none border border-neutral-800 bg-neutral-800/30 px-4 py-3">
            <Spinner size="sm" />
            <span className="text-sm text-neutral-500">Loading invoices...</span>
          </div>
        ) : !invoices || invoices.length === 0 ? (
          <p className="rounded-none border border-neutral-800 bg-neutral-800/30 px-4 py-3 text-sm text-neutral-500">
            No invoices yet. Your first invoice appears here after your first payment.
          </p>
        ) : (
          <div className="rounded-none border border-neutral-800 bg-neutral-800/30 divide-y divide-neutral-800">
            {invoices.map(invoice => {
              const isCreditNote = invoice.document_type === 'credit_note'
              const fmt = new Intl.NumberFormat(undefined, { style: 'currency', currency: invoice.currency || 'EUR' })
              return (
                <div key={invoice.id} className="flex items-center justify-between px-4 py-3 group text-sm">
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
                      <span className="text-xs px-2 py-0.5 rounded-none bg-blue-900/30 text-blue-400">
                        Credit Note
                      </span>
                    ) : (
                      <span className={`text-xs px-2 py-0.5 rounded-none ${invoice.status === 'sent' ? 'bg-green-900/30 text-green-400' : 'bg-neutral-800 text-neutral-400'}`}>
                        {invoice.status === 'sent' ? 'Paid' : invoice.status}
                      </span>
                    )}
                    {/* Hover-reveal only where hover exists — always visible on touch. */}
                    <div className="sm:opacity-0 sm:group-hover:opacity-100 transition-opacity ease-apple">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => downloadInvoicePDF(invoice.id).catch(() => toast.error('PDF not available yet'))}
                              className="p-1.5 rounded-none hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors ease-apple"
                            >
                              <DownloadSimple size={16} />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Download PDF</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
