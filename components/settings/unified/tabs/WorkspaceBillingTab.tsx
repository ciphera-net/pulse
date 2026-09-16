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
  Switcher,
  getAuthErrorMessage,
} from '@ciphera-net/facet'
import { CreditCard, DownloadSimple } from '@phosphor-icons/react'
import { SettingsPanel, PanelRow, PanelRows, EmptyRow } from '@/components/settings/panels'
import { StatusChip } from '@/components/settings/StatusChip'
import { MastheadAction } from '@/components/settings/shell-slots'
import { SettingsErrorState } from '@/components/settings/SettingsErrorState'
import SettingsLoadingState from '@/components/settings/SettingsLoadingState'
import SettingsSaveBar from '@/components/settings/SettingsSaveBar'
import { useSubscription } from '@/lib/swr/dashboard'
import {
  updatePaymentMethod,
  cancelSubscription,
  resumeSubscription,
  getInvoices,
  getPrices,
  downloadInvoicePDF,
  updateBillingSettings,
  type SubscriptionDetails,
} from '@/lib/api/billing'
import { formatCalendarDate, formatCalendarDateFull, formatDateUTC } from '@/lib/utils/formatDate'
import { formatEuro, formatEuroCents, formatMoneyCents } from '@/lib/utils/money'
import { cdnUrl } from '@/lib/cdn'
import { useCan } from '@/lib/auth/permissions'
import { formatPlanName, getPlanPricing, FREE_PAGEVIEW_LIMIT } from '@/lib/plans'

const PAYMENT_METHODS = [
  { id: 'creditcard', label: 'Cards', icons: ['/icons/payment/visa.svg', '/icons/payment/mastercard.svg'] },
  { id: 'bancontact', label: 'Bancontact', icons: ['/icons/payment/bancontact.svg'] },
  { id: 'directdebit', label: 'SEPA', icons: ['/icons/payment/sepa.svg'] },
  { id: 'ideal', label: 'iDEAL', icons: ['/icons/payment/ideal.svg'] },
  { id: 'applepay', label: 'Apple Pay', icons: ['/icons/payment/applepay.svg'] },
]

/** A single usage stat tile inside the plan-band RailGrid. The number leads
 *  (tabular numerals, text-xl), the muted label sits below it — a stat tile
 *  reads as a metric only when the number is the first thing the eye lands
 *  on; label-above read as a form field instead (settings overhaul §2.2). */
function StatTile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <RailGridTile>
      <p className="text-xl font-semibold tabular-nums text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
      {sub}
    </RailGridTile>
  )
}

interface BillingFormFields {
  business_name: string
  billing_email: string
  address: string
  city: string
  postal_code: string
}

const EMPTY_BILLING_FORM: BillingFormFields = {
  business_name: '',
  billing_email: '',
  address: '',
  city: '',
  postal_code: '',
}

function billingFieldsFromSubscription(sub: SubscriptionDetails): BillingFormFields {
  return {
    business_name: sub.business_name ?? '',
    billing_email: sub.billing_email ?? '',
    address: sub.billing_address ?? '',
    city: sub.billing_city ?? '',
    postal_code: sub.billing_postal_code ?? '',
  }
}

export default function WorkspaceBillingTab() {
  const router = useRouter()
  const canManageBilling = useCan('billing.manage')
  const { data: subscription, error: subscriptionError, isLoading, mutate } = useSubscription()
  const [cancelling, setCancelling] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [showPaymentMethodModal, setShowPaymentMethodModal] = useState(false)
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('')

  // Billing details is an always-editable form now — SettingsSaveBar owns the
  // dirty/save/discard cycle, replacing the old pencil-toggled display/edit
  // mode. `baseline` seeds once from the first subscription payload
  // (hasInitializedBilling guards a later revalidation, e.g. the cancel/resume
  // flows below calling mutate(), from clobbering an in-progress edit) and is
  // re-set to the saved values after a successful save — the same shape
  // AccountProfileTab's own display-name field uses.
  const [billingForm, setBillingForm] = useState<BillingFormFields>(EMPTY_BILLING_FORM)
  const [billingBaseline, setBillingBaseline] = useState<BillingFormFields>(EMPTY_BILLING_FORM)
  const hasInitializedBilling = useRef(false)

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
    ? getAuthErrorMessage(invoicesFetchError as Error) || "Couldn't load your invoices. Try again."
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

  useEffect(() => {
    if (!subscription || hasInitializedBilling.current) return
    const fields = billingFieldsFromSubscription(subscription)
    setBillingForm(fields)
    setBillingBaseline(fields)
    hasInitializedBilling.current = true
  }, [subscription])

  const handleUpdatePayment = async (method: string) => {
    try {
      const { url } = await updatePaymentMethod(method)
      window.location.href = url
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || "Couldn't open the payment portal. Try again.")
    }
  }

  const handleCancel = async () => {
    setCancelling(true)
    try {
      const result = await cancelSubscription()
      if (!result.ok) {
        toast.error("Couldn't cancel your subscription. Try again.")
        return
      }
      // Optimistic paint, then revalidate against the server — the old
      // `revalidate: false` fabricated the cache and never read the API's
      // actual answer, so a server-side no-op rendered as success forever.
      await mutate(
        subscription ? { ...subscription, cancel_at_period_end: true } : undefined,
        { revalidate: true },
      )
      toast.success('Subscription cancelled')
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || "Couldn't cancel your subscription. Try again.")
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
        router.push('/switch')
        return
      }
      if (!result.ok) {
        toast.error("Couldn't resume your subscription. Try again.")
        return
      }
      await mutate(
        subscription ? { ...subscription, cancel_at_period_end: false } : undefined,
        { revalidate: true },
      )
      toast.success('Subscription resumed')
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || "Couldn't resume your subscription. Try again.")
    }
  }

  const billingDirty = hasInitializedBilling.current
    ? (Object.keys(billingBaseline) as (keyof BillingFormFields)[]).some(
        (key) => billingForm[key] !== billingBaseline[key],
      )
    : false

  const handleDiscardBilling = () => setBillingForm(billingBaseline)

  const handleSaveBilling = async () => {
    try {
      const result = await updateBillingSettings({
        billing_email: billingForm.billing_email,
        business_name: billingForm.business_name,
        address: billingForm.address,
        city: billingForm.city,
        postal_code: billingForm.postal_code,
      })
      if (result.ok) {
        setBillingBaseline(billingForm)
        await mutate()
        toast.success('Billing details updated')
      } else {
        // ok:false is a failure and must say so — the old silence left the
        // form open with the user believing the save landed.
        toast.error("Couldn't save your billing details. Try again.")
      }
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || "Couldn't save your billing details. Try again.")
    }
  }

  const openPaymentModal = () => {
    setSelectedPaymentMethod('')
    setShowPaymentMethodModal(true)
  }

  if (isLoading) {
    return <SettingsLoadingState rows={4} />
  }

  // A failed fetch is NOT "no subscription": the old fall-through rendered
  // "You're on the free Personal plan" to a paying customer whose request blipped.
  // Ruled error device (F1, options round 25-08) — named blast radius + retry.
  if (subscriptionError && !subscription) {
    return (
      <SettingsErrorState
        title="Couldn't load your subscription"
        message="Your plan and usage are temporarily unavailable. Your subscription itself is unaffected."
        onRetry={() => mutate()}
      />
    )
  }

  if (!subscription) {
    return (
      <SettingsPanel title="Subscription">
        <EmptyRow
          icon={<CreditCard />}
          title="No subscription"
          caption="You're on the free Personal plan."
          action={
            <Button variant="outline" size="sm" onClick={() => router.push('/setup/plan')}>
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
  // Personal/free orgs have a subscription row but no live Mollie subscription —
  // payment-method and cancel actions would only error for them.
  const isFree = subscription.plan_id === 'free' && subscription.subscription_status === ''

  const planPricing = getPlanPricing(prices, subscription.plan_id, subscription.pageview_limit)
  const isYearlyInterval = subscription.billing_interval === 'year'

  const overLimit =
    subscription.pageview_limit > 0 &&
    typeof subscription.pageview_usage === 'number' &&
    subscription.pageview_usage > subscription.pageview_limit

  // The hard ceiling is the ONLY point at which collection actually stops. Absence
  // is "unknown" (a backend older than 15-08-2026), which must never be read as 0 —
  // a 0 ceiling would render every org as blocked. Hence the explicit typeof guard
  // rather than `subscription.pageview_hard_ceiling ?? 0`.
  const hardCeiling =
    typeof subscription.pageview_hard_ceiling === 'number' && subscription.pageview_hard_ceiling > 0
      ? subscription.pageview_hard_ceiling
      : null

  const atCeiling =
    hardCeiling !== null &&
    typeof subscription.pageview_usage === 'number' &&
    subscription.pageview_usage >= hardCeiling

  // The renewal date, rendered from the calendar date VERBATIM. No Date is
  // constructed from it, so there is no instant to shift and no timezone that can
  // move it — the display defect is unrepresentable rather than merely avoided.
  // null means "no scheduled charge", which is a real state for a grant, the free
  // tier or a cancelled subscription, and renders as an absent tile rather than a
  // fabricated date.
  const nextChargeLabel = formatCalendarDateFull(subscription.next_charge_on)

  // A GRANT's end date, which is a different fact from a charge date and now lives
  // in a different column (backend migration 142). Before the split, the admin grant
  // path wrote a grant's end into next_charge_on, so a granted org's billing page
  // said "RENEWS" about a date on which nothing would be charged. Rendered with the
  // same calendar-date formatter for the same reason: no Date is constructed, so
  // there is no instant to shift.
  const grantEndsLabel = formatCalendarDateFull(subscription.grant_expires_on)

  const usageRatio =
    subscription.pageview_limit > 0 && typeof subscription.pageview_usage === 'number'
      ? subscription.pageview_usage / subscription.pageview_limit
      : 0

  // A grant is an org someone at Ciphera gave a plan — nothing is billed.
  // Detection is grant_expires_on (migration 142's column; the prod grant rows
  // were backfilled by migration 158) AND no scheduled charge: AdminGrantPlan
  // deliberately does not clear next_charge_on, so a granted org can still
  // carry a live Mollie subscription — for that hybrid, "nothing is billed"
  // would be a lie and hiding the payment actions would strand a real
  // subscription. Grant presentation engages only when no charge is scheduled.
  const isGrant = Boolean(subscription.grant_expires_on) && !subscription.next_charge_on

  // Non-CTA management actions live in the plan-band footer. Hidden for
  // Personal/free, cancelled AND granted orgs: there is no Mollie customer or
  // subscription behind any of them, so both calls would only error.
  const showActions = !isCanceled && !isFree && !isGrant && canManageBilling

  // Governs BOTH the billing-details panel and its SettingsSaveBar — a
  // manager on the free plan with no billing_email yet sees neither: the
  // panel has nothing to show, so a save bar with no inputs behind it would
  // be a mounted device that can never go dirty.
  const showBillingDetails = Boolean(subscription.billing_email || (canManageBilling && !isFree))

  // The panel-header status chip. subscription_status and cancel_at_period_end
  // are mutually exclusive across these branches, so at most one chip ever
  // renders — one chip shape for the tab (rule §4.5), dot on every one of
  // them, "Paid" in the invoices table included below.
  let planChip: React.ReactNode = null
  if (isActive && !isTrialing && !subscription.cancel_at_period_end) {
    // A running plan is a genuinely good, live state — success (green).
    planChip = <StatusChip tone="success" dot>Active</StatusChip>
  } else if (isTrialing && !subscription.cancel_at_period_end) {
    // A trial is running too, so it reads success with its own label.
    planChip = <StatusChip tone="success" dot>Trial</StatusChip>
  } else if (isCanceled) {
    // Cancelled is a settled, user-chosen end state (now on the free tier) —
    // not trouble, so neutral, never coral.
    planChip = <StatusChip tone="neutral" dot>Cancelled</StatusChip>
  } else if (subscription.cancel_at_period_end) {
    planChip = <StatusChip tone="warning" dot>Cancelling</StatusChip>
  } else if (isPastDue) {
    // Past due IS genuine trouble — the plan is at risk — so it earns the
    // coral danger tone (coral is reserved for real problems).
    planChip = <StatusChip tone="danger" dot>Past due</StatusChip>
  }

  return (
    <div className="space-y-8">
      {/* The tab's ONE primary CTA — the page's single solid-orange element.
          Hidden in past_due (the /switch guard bounces there — Update payment
          method is the correct action) and for non-managers. */}
      {canManageBilling && !isPastDue && (
        <MastheadAction>
          {/* Every plan change goes through /switch (ruled E1) — routing free
              and cancelled orgs into /setup/plan funneled paying customers
              through the first-run onboarding completion screen and re-fired
              welcome_completed (F-C10). */}
          <Button variant="default" onClick={() => router.push('/switch')}>
            {isCanceled ? 'Resubscribe' : isFree ? 'Upgrade' : 'Change plan'}
          </Button>
        </MastheadAction>
      )}

      {/* ── Plan status band ── */}
      <SettingsPanel
        title={`${planLabel} plan`}
        description={!canManageBilling ? 'Only the workspace owner can modify billing.' : undefined}
        action={planChip}
      >
        {isCanceled ? (
          <p className="px-5 py-4 text-sm text-muted-foreground">
            Your {planLabel} plan has expired. You&apos;re now limited to{' '}
            {FREE_PAGEVIEW_LIMIT.toLocaleString()} pageviews/month on the free tier.
          </p>
        ) : (
          <RailGrid
            minTileWidth={150}
            className="border-0"
            // auto-FIT, not Facet's default auto-FILL. auto-fill keeps the empty
            // tracks at the end of a row, and because RailGrid paints bg-border
            // behind its 1px gaps, an empty track renders as a bordered ghost cell —
            // visible on this tab at desktop widths whenever the tile count is short
            // of the column count. auto-fit collapses those tracks so the real tiles
            // stretch instead. `style` is the component's documented override slot;
            // changing Facet's default is the better fix and is a separate change,
            // since it moves layout in every consumer of the design system.
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}
          >
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
                  <div className="mt-2 h-1 w-full max-w-40 overflow-hidden rounded-none bg-muted">
                    <div
                      className={`h-full ${usageRatio >= 0.9 ? 'bg-destructive' : 'bg-foreground/30'}`}
                      style={{ width: `${Math.min(100, usageRatio * 100)}%` }}
                    />
                  </div>
                }
              />
            )}
            {nextChargeLabel && (
              <StatTile
                label={subscription.cancel_at_period_end ? 'Ends' : isTrialing ? 'Trial ends' : 'Renews'}
                value={nextChargeLabel}
              />
            )}
            {grantEndsLabel && (
              <StatTile label="Grant ends" value={grantEndsLabel} />
            )}
            {planPricing && !isFree && (
              // No fallback tile for plan ids without a prices entry (grants,
              // Personal): the old "Limit" tile repeated the Pageviews tile's
              // denominator one track over. Absence is the honest render.
              <StatTile
                label="Price"
                value={isYearlyInterval ? `${formatEuro(planPricing.yearlyTotal)}/yr` : `${formatEuro(planPricing.monthly)}/mo`}
                sub={
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    excl. VAT{isYearlyInterval ? ` · ${formatEuro(planPricing.effectiveMonthly)}/mo` : ''}
                  </p>
                }
              />
            )}
          </RailGrid>
        )}

        {/* The grant, said plainly (ruled D2, options round 25-08): one quiet
            sentence where the payment actions would sit — not a paid-plan
            cosplay with buttons that could only error. */}
        {isGrant && !isCanceled && (
          <p className="border-t border-border px-5 py-3 text-sm text-muted-foreground">
            This workspace runs on a granted {planLabel} plan
            {formatCalendarDate(subscription.grant_expires_on)
              ? ` until ${formatCalendarDate(subscription.grant_expires_on)}.`
              : '.'}{' '}
            Nothing is billed.
          </p>
        )}

        {showActions && (
          <div className="flex flex-wrap gap-2 border-t border-border px-5 py-4">
            <Button onClick={openPaymentModal} variant="outline" size="sm" className="gap-1.5">
              <CreditCard weight="bold" className="h-3.5 w-3.5" />
              Update payment method
            </Button>

            {isActive && !subscription.cancel_at_period_end && (
              <Button onClick={() => setShowCancelConfirm(true)} variant="outline" size="sm">
                Cancel subscription
              </Button>
            )}

            {subscription.cancel_at_period_end && (
              <Button onClick={handleResume} variant="outline" size="sm">
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
                ? 'Payment past due. Update your payment method to keep your plan.'
                : "We couldn't process your last payment."
            }
            action={
              canManageBilling ? (
                <Button variant="outline" size="sm" onClick={openPaymentModal}>
                  Update payment method
                </Button>
              ) : undefined
            }
          >
            {canManageBilling
              ? isPastDue
                ? undefined
                : 'Update your payment method to avoid service interruption.'
              : 'Contact your workspace owner to update the payment method.'}
          </Banner>
        )}

        {/* Over the plan limit — but still collecting.
            The old copy here said "Upgrade to keep collecting data", which is no
            longer true and was never quite honest: going over the plan limit is a
            billing event, and every pageview above it is still stored and served.
            Collection stops only at the hard ceiling, which gets its own banner
            below. Saying "we stopped" when we did not is the same class of mistake
            as saying "you're fine" when we had. */}
        {!isCanceled && overLimit && !atCeiling && (
          <Banner
            tone="warning"
            title={`You're over your plan's pageview limit (${subscription.pageview_usage!.toLocaleString()} of ${subscription.pageview_limit.toLocaleString()}).`}
            action={
              canManageBilling ? (
                <Button variant="outline" size="sm" onClick={() => router.push('/switch')}>
                  Upgrade your plan
                </Button>
              ) : undefined
            }
          >
            {hardCeiling !== null
              ? `We're still collecting your data, up to ${hardCeiling.toLocaleString()} pageviews. ${
                  canManageBilling
                    ? 'Upgrade to raise the limit.'
                    : 'Contact your workspace owner to upgrade the plan.'
                }`
              : canManageBilling
                ? 'Upgrade to raise the limit.'
                : 'Contact your workspace owner to upgrade the plan.'}
          </Banner>
        )}

        {/* At the hard ceiling — collection has actually stopped. */}
        {!isCanceled && atCeiling && (
          <Banner
            tone="danger"
            title={`Collection has stopped: you've reached the ${hardCeiling!.toLocaleString()} pageview ceiling.`}
            action={
              canManageBilling ? (
                <Button variant="outline" size="sm" onClick={() => router.push('/switch')}>
                  Upgrade your plan
                </Button>
              ) : undefined
            }
          >
            {canManageBilling
              ? 'New pageviews are no longer being recorded. Upgrading restores collection immediately.'
              : 'New pageviews are no longer being recorded. Contact your workspace owner to upgrade the plan.'}
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
                pending.
                {nextChargeLabel ? ` Applies ${nextChargeLabel}.` : ''}
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
                {formatEuroCents(subscription.credit_balance)}
              </span>
            }
          >
            Automatically applied to your next invoice.
          </Banner>
        )}
      </div>

      {/* Payment method selection */}
      <Modal isOpen={showPaymentMethodModal} onClose={() => setShowPaymentMethodModal(false)} title="Choose payment method" className="max-w-sm">
        <Switcher
          aria-label="Payment method"
          tone="solid"
          className="mb-4 w-full flex-wrap"
          value={selectedPaymentMethod}
          onChange={setSelectedPaymentMethod}
          options={PAYMENT_METHODS.map((method) => ({
            value: method.id,
            label: (
              <span className="flex items-center gap-1.5 py-1">
                <span className="flex items-center gap-1 bg-white px-1 py-0.5">
                  {method.icons.map((icon) => (
                    <img key={icon} src={cdnUrl(icon)} alt="" className="h-4 w-auto" />
                  ))}
                </span>
                {method.label}
              </span>
            ),
          }))}
        />
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
          {nextChargeLabel
            ? <>Your {planLabel} plan stays fully active until <span className="text-foreground">{nextChargeLabel}</span>. You won&apos;t be charged again.</>
            : <>You&apos;ll keep access until the end of your current billing period and won&apos;t be charged again.</>}
        </p>
        <p className="mb-5 text-sm text-muted-foreground">
          After that, your workspace moves to the free Personal plan ({FREE_PAGEVIEW_LIMIT.toLocaleString()} pageviews/month, 1 site). Your data stays in place.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setShowCancelConfirm(false)} disabled={cancelling}>
            Keep plan
          </Button>
          <Button variant="destructive" onClick={handleCancel} disabled={cancelling}>
            {cancelling ? 'Cancelling…' : 'Yes, cancel'}
          </Button>
        </div>
      </Modal>

      {/* ── Billing details — always an editable form now (SettingsSaveBar owns
          the dirty/save/discard cycle), not a pencil-toggled display/edit mode.
          A non-manager still gets a read-only view. Also rendered for a manager
          with no billing email yet, so managers are never locked out of
          entering details the API fully supports. ── */}
      {showBillingDetails && (
        <SettingsPanel
          title="Billing details"
          description={
            !canManageBilling
              ? undefined
              : !subscription.billing_email
                ? 'Add your business name, address, and VAT details so they appear on invoices.'
                : subscription.tax_id
                  ? 'To change your country or VAT ID, contact support.'
                  : undefined
          }
        >
          {canManageBilling ? (
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
          ) : null}
        </SettingsPanel>
      )}

      {/* ── Recent invoices ── */}
      <SettingsPanel title="Invoices">
        {invoicesError ? (
          <div className="px-5 py-4">
            <SettingsErrorState variant="banner" message={invoicesError} onRetry={() => retryInvoices()} />
          </div>
        ) : invoicesLoading ? (
          <SettingsLoadingState rows={3} />
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
                return (
                  <TR key={invoice.id}>
                    <TD>
                      {/* No fallback glyph: an unnumbered invoice (not yet minted by
                          Odoo) is an absent value, not a value to paper over — the
                          same "omit the unit, never fabricate a placeholder" rule
                          the plan-band stat tiles above follow for missing dates. */}
                      {invoice.invoice_number && (
                        <span className="font-mono text-xs text-muted-foreground">{invoice.invoice_number}</span>
                      )}
                    </TD>
                    {/* An invoice date is a pinned document date — the instant the
                        server issued it — so it renders as its UTC day. formatDate
                        read the LOCAL day and dated the one real invoice on the
                        estate 16/07 for a document the database dates 15-07. */}
                    <TD className="hidden sm:table-cell tabular-nums">{formatDateUTC(new Date(invoice.created_at))}</TD>
                    <TD numeric>
                      <span className="text-foreground">
                        {isCreditNote ? '−' : ''}{formatMoneyCents(Math.abs(invoice.total_cents), invoice.currency)}
                      </span>
                    </TD>
                    <TD numeric className="hidden sm:table-cell">
                      <span className="text-muted-foreground">
                        {isCreditNote ? 'refund ' : 'incl. '}{formatMoneyCents(Math.abs(invoice.vat_cents), invoice.currency)}
                      </span>
                    </TD>
                    <TD>
                      {isCreditNote ? (
                        <StatusChip tone="info" dot>Credit note</StatusChip>
                      ) : invoice.status === 'sent' || invoice.status === 'paid' ? (
                        // The backend mints `paid` (webhook mirror); `sent` is the
                        // legacy synonym. Both are the same settled fact: Paid.
                        <StatusChip tone="success" dot>Paid</StatusChip>
                      ) : invoice.status === 'refunded' ? (
                        <StatusChip tone="info" dot>Refunded</StatusChip>
                      ) : invoice.status === 'failed' ? (
                        // A failed charge is real trouble — coral, not a quiet grey.
                        <StatusChip tone="danger" dot>Failed</StatusChip>
                      ) : (
                        <StatusChip tone="neutral" dot>{invoice.status}</StatusChip>
                      )}
                    </TD>
                    <TD>
                      {/* Row action ALWAYS visible — never a hover-only reveal. */}
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="Download invoice"
                        onClick={() =>
                          downloadInvoicePDF(invoice.id).catch((e: unknown) => {
                            // "Not available yet" is TRUE for a 404 — Odoo has not
                            // minted the document. It was reported for every failure,
                            // including the 401 that made this button dead for nine
                            // days, which is a misleading answer dressed as a calm one.
                            const status = (e as { status?: number })?.status
                            toast.error(
                              status === 404
                                ? "The invoice isn't available yet."
                                : "Couldn't download the invoice. Try again.",
                            )
                          })
                        }
                      >
                        <DownloadSimple size={16} />
                      </Button>
                    </TD>
                  </TR>
                )
              })}
            </TBody>
          </Table>
        )}
      </SettingsPanel>

      {canManageBilling && showBillingDetails && (
        <SettingsSaveBar
          isDirty={billingDirty}
          onSave={handleSaveBilling}
          onDiscard={handleDiscardBilling}
          saveLabel="Save billing details"
        />
      )}
    </div>
  )
}
