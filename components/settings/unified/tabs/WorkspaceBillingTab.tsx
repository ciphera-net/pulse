'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import {
  Button,
  Input,
  toast,
  Modal,
  Banner,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  RailGrid,
  RailGridTile,
  getAuthErrorMessage,
} from '@ciphera-net/facet'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { CreditCard, DownloadSimple, PencilSimple } from '@phosphor-icons/react'
import { SettingsPanel, PanelRow, PanelRows, EmptyRow } from '@/components/settings/panels'
import { StatusChip } from '@/components/settings/StatusChip'
import { MastheadAction } from '@/components/settings/shell-slots'
import { SettingsErrorState } from '@/components/settings/SettingsErrorState'
import SettingsLoadingState from '@/components/settings/SettingsLoadingState'
import { useSubscription } from '@/lib/swr/dashboard'
import { updatePaymentMethod, cancelSubscription, resumeSubscription, getInvoices, getPrices, downloadInvoicePDF, updateBillingSettings } from '@/lib/api/billing'
import { formatDate, formatDateFull } from '@/lib/utils/formatDate'
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

/** A single usage stat tile inside the plan-band RailGrid — tabular numerals + a
 *  Geist micro-label cap, per spec §2.2. */
function StatTile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <RailGridTile>
      <p className="font-semibold text-micro-label uppercase text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-lg font-semibold tabular-nums text-foreground">{value}</p>
      {sub}
    </RailGridTile>
  )
}

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

  const openPaymentModal = () => {
    setSelectedPaymentMethod('')
    setShowPaymentMethodModal(true)
  }

  if (isLoading) {
    return <SettingsLoadingState rows={4} />
  }

  if (!subscription) {
    return (
      <SettingsPanel kicker="Subscription">
        <EmptyRow
          icon={<CreditCard />}
          title="No subscription"
          caption="You're on the free Hobby plan."
          action={
            <Button variant="secondary" size="sm" onClick={() => router.push('/setup/plan')}>
              View plans
            </Button>
          }
        />
      </SettingsPanel>
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

  const usageRatio =
    subscription.pageview_limit > 0 && typeof subscription.pageview_usage === 'number'
      ? subscription.pageview_usage / subscription.pageview_limit
      : 0

  // Non-CTA management actions live in the plan-band footer. Hidden for
  // Hobby/free and cancelled orgs: there is no Mollie customer or subscription
  // behind them, so both calls would only error.
  const showActions = !isCanceled && !isFree && canManageBilling

  return (
    <div className="space-y-8">
      {/* The tab's ONE primary CTA — the page's single solid-orange element.
          Hidden in past_due (the /switch guard bounces there — Update payment
          method is the correct action) and for non-managers. */}
      {canManageBilling && !isPastDue && (
        <MastheadAction>
          <Button
            variant="default"
            onClick={() => router.push(isCanceled || isFree ? '/setup/plan' : '/switch')}
          >
            {isCanceled ? 'Resubscribe' : isFree ? 'Upgrade' : 'Change Plan'}
          </Button>
        </MastheadAction>
      )}

      {/* ── Plan status band ── */}
      <SettingsPanel>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-foreground">{planLabel} Plan</h3>
            {/* A running plan is a genuinely good, live state — success (green).
                A trial is running too, so it reads success with its own label. */}
            {isActive && !isTrialing && !subscription.cancel_at_period_end && (
              <StatusChip tone="success" dot>Active</StatusChip>
            )}
            {isTrialing && !subscription.cancel_at_period_end && (
              <StatusChip tone="success" dot>Trial</StatusChip>
            )}
            {/* Cancelled is a settled, user-chosen end state (now on the free
                tier) — not trouble, so neutral, never coral. */}
            {subscription.subscription_status === 'canceled' && (
              <StatusChip tone="neutral">Cancelled</StatusChip>
            )}
            {subscription.cancel_at_period_end && subscription.subscription_status !== 'canceled' && (
              <StatusChip tone="warning">Cancelling</StatusChip>
            )}
            {/* Past due IS genuine trouble — the plan is at risk — so it earns the
                coral danger tone (coral is reserved for real problems). */}
            {isPastDue && <StatusChip tone="danger" dot>Past due</StatusChip>}
          </div>
          {!canManageBilling && (
            <p className="text-xs text-muted-foreground">Only the workspace owner can modify billing.</p>
          )}
        </div>

        {isCanceled ? (
          <p className="px-5 py-4 text-sm text-muted-foreground">
            Your {planLabel} plan has expired. You&apos;re now limited to{' '}
            {FREE_PAGEVIEW_LIMIT.toLocaleString()} pageviews/month on the free tier.
          </p>
        ) : (
          <RailGrid minTileWidth={150} className="border-0">
            {typeof subscription.sites_count === 'number' && (
              <StatTile label="Sites" value={subscription.sites_count} />
            )}
            {subscription.pageview_limit > 0 && typeof subscription.pageview_usage === 'number' && (
              <StatTile
                label="Pageviews"
                value={
                  <>
                    {subscription.pageview_usage.toLocaleString()}
                    <span className="text-muted-foreground"> / {subscription.pageview_limit.toLocaleString()}</span>
                  </>
                }
                sub={
                  <div className="mt-2 h-1 w-full max-w-[160px] overflow-hidden rounded-none bg-muted">
                    <div
                      className={`h-full ${usageRatio >= 0.9 ? 'bg-destructive' : 'bg-foreground/30'}`}
                      style={{ width: `${Math.min(100, usageRatio * 100)}%` }}
                    />
                  </div>
                }
              />
            )}
            {subscription.current_period_end && (
              <StatTile
                label={subscription.cancel_at_period_end ? 'Ends' : isTrialing ? 'Trial ends' : 'Renews'}
                value={formatDateFull(new Date(subscription.current_period_end))}
              />
            )}
            {planPricing && !isFree ? (
              <StatTile
                label="Price"
                value={isYearlyInterval ? `€${planPricing.yearlyTotal}/yr` : `€${planPricing.monthly}/mo`}
                sub={
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    excl. VAT{isYearlyInterval ? ` · €${planPricing.effectiveMonthly}/mo` : ''}
                  </p>
                }
              />
            ) : subscription.pageview_limit > 0 ? (
              // Legacy plan ids have no entry in the prices map — fall back to
              // the limit rather than showing an empty cell.
              <StatTile label="Limit" value={`${subscription.pageview_limit.toLocaleString()} / mo`} />
            ) : null}
          </RailGrid>
        )}

        {showActions && (
          <div className="flex flex-wrap gap-2 border-t border-border px-5 py-4">
            <Button onClick={openPaymentModal} variant="secondary" size="sm" className="gap-1.5">
              <CreditCard weight="bold" className="h-3.5 w-3.5" />
              Update payment method
            </Button>

            {isActive && !subscription.cancel_at_period_end && (
              <Button
                onClick={() => setShowCancelConfirm(true)}
                variant="secondary"
                size="sm"
                className="text-muted-foreground hover:text-destructive"
              >
                Cancel subscription
              </Button>
            )}

            {subscription.cancel_at_period_end && (
              <Button onClick={handleResume} variant="secondary" size="sm">
                Resume subscription
              </Button>
            )}
          </div>
        )}
      </SettingsPanel>

      {/* ── Account state banners (spec §2.3: trouble / credit / pending) ── */}
      <div className="space-y-3">
        {/* One payment-trouble banner: past_due (plan at risk) or a softer
            payment-failed warning while the subscription is still active. */}
        {(isPastDue || subscription.payment_failed_at) && (
          <Banner
            tone="warning"
            title={
              isPastDue
                ? 'Payment past due — update your payment method to keep your plan.'
                : 'Your last payment could not be processed.'
            }
            action={
              canManageBilling ? (
                <Button variant="secondary" size="sm" onClick={openPaymentModal}>
                  Update payment method
                </Button>
              ) : undefined
            }
          >
            {canManageBilling
              ? isPastDue
                ? undefined
                : 'Update your payment method to avoid service interruption.'
              : 'Please contact your workspace owner to update the payment method.'}
          </Banner>
        )}

        {/* Over-limit usage warning */}
        {!isCanceled && overLimit && (
          <Banner
            tone="warning"
            title={`You've exceeded your monthly pageview limit (${subscription.pageview_usage!.toLocaleString()} of ${subscription.pageview_limit.toLocaleString()}).`}
            action={
              canManageBilling ? (
                <Button variant="secondary" size="sm" onClick={() => router.push('/switch')}>
                  Upgrade your plan
                </Button>
              ) : undefined
            }
          >
            {canManageBilling
              ? 'Upgrade to keep collecting data.'
              : 'Contact your workspace owner to upgrade the plan.'}
          </Banner>
        )}

        {/* Pending plan change notice */}
        {subscription.pending_plan_id && (
          <Banner
            tone="info"
            title={
              <>
                Plan change to{' '}
                <span className="font-semibold text-foreground">{formatPlanName(subscription.pending_plan_id)}</span>
                {subscription.pending_limit
                  ? ` (${subscription.pending_limit.toLocaleString()} pageviews/${subscription.pending_interval === 'month' ? 'mo' : 'yr'})`
                  : ''}{' '}
                pending
                {subscription.current_period_end
                  ? ` — applies ${formatDateFull(new Date(subscription.current_period_end))}`
                  : ''}
              </>
            }
          />
        )}

        {/* Account credit */}
        {subscription.credit_balance != null && subscription.credit_balance > 0 && (
          <Banner
            tone="info"
            title="Account credit"
            action={
              <span className="text-sm font-semibold tabular-nums text-foreground">
                {euro.format(subscription.credit_balance / 100)}
              </span>
            }
          >
            Automatically applied to your next invoice.
          </Banner>
        )}
      </div>

      {/* Payment method selection */}
      <Modal isOpen={showPaymentMethodModal} onClose={() => setShowPaymentMethodModal(false)} title="Choose payment method" className="max-w-sm">
        <div role="radiogroup" aria-label="Payment method" className="mb-4 grid grid-cols-3 gap-2">
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
                className={`flex h-[60px] flex-col items-center justify-center gap-1.5 rounded-none border text-xs transition-all duration-base ease-apple focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-orange ${
                  selected
                    ? 'border-brand-orange bg-brand-orange/5 text-foreground'
                    : 'border-input bg-muted text-muted-foreground hover:border-border hover:bg-accent'
                }`}
              >
                <div className="flex items-center gap-1 rounded-none bg-white px-1.5 py-1">
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
          className="w-full"
          onClick={() => { setShowPaymentMethodModal(false); handleUpdatePayment(selectedPaymentMethod) }}
          disabled={!selectedPaymentMethod}
        >
          Continue
        </Button>
      </Modal>

      {/* Cancel confirmation */}
      <Modal isOpen={showCancelConfirm} onClose={() => setShowCancelConfirm(false)} title="Cancel subscription" className="max-w-md">
        <p className="mb-3 text-sm text-muted-foreground">
          Are you sure you want to cancel your subscription?
        </p>
        <p className="mb-1 text-sm text-muted-foreground">
          {subscription.current_period_end
            ? <>Your {planLabel} plan stays fully active until <span className="text-foreground">{formatDateFull(new Date(subscription.current_period_end))}</span> — you won&apos;t be charged again.</>
            : <>You&apos;ll keep access until the end of your current billing period and won&apos;t be charged again.</>}
        </p>
        <p className="mb-5 text-sm text-muted-foreground">
          After that, your workspace moves to the free Hobby plan ({FREE_PAGEVIEW_LIMIT.toLocaleString()} pageviews/month, 1 site). Your data stays in place.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setShowCancelConfirm(false)} disabled={cancelling}>
            Keep plan
          </Button>
          <Button variant="destructive" onClick={handleCancel} disabled={cancelling}>
            {cancelling ? 'Cancelling...' : 'Yes, cancel'}
          </Button>
        </div>
      </Modal>

      {/* ── Billing details — PropertyRows with inline edit (spec §6). Also
          rendered (as an add-details empty state) when the billing email
          hasn't synced yet, so managers are never locked out of entering
          details the API fully supports. ── */}
      {(subscription.billing_email || (canManageBilling && !isFree)) && (
        <SettingsPanel
          kicker="Billing details"
          action={
            !editingBilling && canManageBilling && subscription.billing_email ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={handleEditBilling}
                      className="rounded-none p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <PencilSimple size={14} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Edit billing</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : undefined
          }
        >
          {editingBilling ? (
            <>
              <PanelRows>
                <PanelRow label="Business name" htmlFor="bd-business-name">
                  <Input
                    id="bd-business-name"
                    type="text"
                    value={billingForm.business_name}
                    onChange={e => setBillingForm(f => ({ ...f, business_name: e.target.value }))}
                    placeholder="Business name"
                  />
                </PanelRow>
                <PanelRow label="Billing email" htmlFor="bd-billing-email">
                  <Input
                    id="bd-billing-email"
                    type="email"
                    value={billingForm.billing_email}
                    onChange={e => setBillingForm(f => ({ ...f, billing_email: e.target.value }))}
                    placeholder="billing@example.com"
                  />
                </PanelRow>
                <PanelRow label="Address" htmlFor="bd-address">
                  <Input
                    id="bd-address"
                    type="text"
                    value={billingForm.address}
                    onChange={e => setBillingForm(f => ({ ...f, address: e.target.value }))}
                    placeholder="Street address"
                  />
                </PanelRow>
                <PanelRow label="City" htmlFor="bd-city">
                  <Input
                    id="bd-city"
                    type="text"
                    value={billingForm.city}
                    onChange={e => setBillingForm(f => ({ ...f, city: e.target.value }))}
                    placeholder="City"
                  />
                </PanelRow>
                <PanelRow label="Postal code" htmlFor="bd-postal-code">
                  <Input
                    id="bd-postal-code"
                    type="text"
                    value={billingForm.postal_code}
                    onChange={e => setBillingForm(f => ({ ...f, postal_code: e.target.value }))}
                    placeholder="Postal code"
                  />
                </PanelRow>
              </PanelRows>
              <div className="space-y-3 border-t border-border px-5 py-4">
                {subscription.tax_id && (
                  <p className="text-xs text-muted-foreground">
                    To change your country or VAT ID, please contact support.
                  </p>
                )}
                <div className="flex gap-2">
                  <Button variant="default" size="sm" onClick={handleSaveBilling} disabled={savingBilling}>
                    {savingBilling ? 'Saving...' : 'Save'}
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setEditingBilling(false)} disabled={savingBilling}>
                    Cancel
                  </Button>
                </div>
              </div>
            </>
          ) : subscription.billing_email ? (
            <PanelRows>
              {subscription.business_name && (
                <PanelRow label="Business name">
                  <span className="text-sm text-foreground">{subscription.business_name}</span>
                </PanelRow>
              )}
              <PanelRow label="Email">
                <span className="text-sm text-foreground">{subscription.billing_email}</span>
              </PanelRow>
              {subscription.billing_address && (
                <PanelRow label="Address">
                  <span className="text-sm text-foreground">
                    {subscription.billing_address}
                    {subscription.billing_postal_code ? `, ${subscription.billing_postal_code}` : ''}
                    {subscription.billing_city ? ` ${subscription.billing_city}` : ''}
                  </span>
                </PanelRow>
              )}
            </PanelRows>
          ) : (
            <EmptyRow
              icon={<CreditCard />}
              title="No billing details on file yet."
              caption="Add your business name, address, and VAT details so they appear on invoices."
              action={
                <Button variant="secondary" size="sm" onClick={handleEditBilling}>
                  Add billing details
                </Button>
              }
            />
          )}
        </SettingsPanel>
      )}

      {/* ── Recent invoices — RuledTable (spec §2.2) ── */}
      <SettingsPanel kicker="Invoices">
        {invoicesError ? (
          <div className="px-5 py-4">
            <SettingsErrorState variant="banner" message={invoicesError} onRetry={() => retryInvoices()} />
          </div>
        ) : invoicesLoading ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">Loading invoices…</p>
        ) : !invoices || invoices.length === 0 ? (
          <EmptyRow
            icon={<DownloadSimple />}
            title="No invoices yet."
            caption="Your first invoice appears here after your first payment."
          />
        ) : (
          <Table aria-label="Invoices" containerClassName="border-0">
            <THead>
              <TR>
                <TH>Invoice</TH>
                {/* Date + VAT drop out below sm so Invoice/Amount/Status/Download
                    fit a narrow viewport — no data change, both stay in the PDF. */}
                <TH className="hidden sm:table-cell">Date</TH>
                <TH numeric>Amount</TH>
                <TH numeric className="hidden sm:table-cell">VAT</TH>
                <TH>Status</TH>
                <TH>
                  <span className="sr-only">Download</span>
                </TH>
              </TR>
            </THead>
            <TBody>
              {invoices.map(invoice => {
                const isCreditNote = invoice.document_type === 'credit_note'
                const fmt = new Intl.NumberFormat(undefined, { style: 'currency', currency: invoice.currency || 'EUR' })
                return (
                  <TR key={invoice.id}>
                    <TD>
                      <span className="font-mono text-xs text-muted-foreground">{invoice.invoice_number ?? '—'}</span>
                    </TD>
                    <TD className="hidden sm:table-cell">{formatDate(new Date(invoice.created_at))}</TD>
                    <TD numeric>
                      <span className="text-foreground">
                        {isCreditNote ? '−' : ''}{fmt.format(Math.abs(invoice.total_cents) / 100)}
                      </span>
                    </TD>
                    <TD numeric className="hidden sm:table-cell">
                      <span className="text-muted-foreground">
                        {isCreditNote ? 'refund ' : 'incl. '}{fmt.format(Math.abs(invoice.vat_cents) / 100)}
                      </span>
                    </TD>
                    <TD>
                      {isCreditNote ? (
                        <StatusChip tone="info">Credit Note</StatusChip>
                      ) : invoice.status === 'sent' ? (
                        <StatusChip tone="success">Paid</StatusChip>
                      ) : invoice.status === 'failed' ? (
                        // A failed charge is real trouble — coral, not a quiet grey.
                        <StatusChip tone="danger">Failed</StatusChip>
                      ) : (
                        <StatusChip tone="neutral">{invoice.status}</StatusChip>
                      )}
                    </TD>
                    <TD>
                      {/* Row action ALWAYS visible — never a hover-only reveal. */}
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => downloadInvoicePDF(invoice.id).catch(() => toast.error('PDF not available yet'))}
                              className="rounded-none p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                              aria-label="Download PDF"
                            >
                              <DownloadSimple size={16} />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Download PDF</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TD>
                  </TR>
                )
              })}
            </TBody>
          </Table>
        )}
      </SettingsPanel>
    </div>
  )
}
