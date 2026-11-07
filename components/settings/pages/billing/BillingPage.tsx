'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { Button, toast } from '@ciphera-net/facet'
import { useUndo } from '@ciphera-net/facet-hold'
import { ArrowsClockwise, Package, Warning, WarningCircle, WarningOctagon } from '@phosphor-icons/react'
import { KitPage, KitRow, KitRows, KitSection, KitStats, KitStatus } from '@/components/settings/kit/Kit'
import { MastheadAction } from '@/components/settings/shell-slots'
import { SettingsErrorState } from '@/components/settings/SettingsErrorState'
import SettingsLoadingState from '@/components/settings/SettingsLoadingState'
import { useSubscription } from '@/lib/swr/dashboard'
import {
  cancelSubscription,
  getCatalog,
  getInvoices,
  getPaymentMethodUpdate,
  resumeSubscription,
  type SubscriptionDetails,
} from '@/lib/api/billing'
import { useCan } from '@/lib/auth/permissions'
import { useTeamState } from '@/lib/hooks/useTeamState'
import { usePendingKeys, whilePending } from '@/lib/hold/pending'
import { eventMeter, formatPlanName, getPlanPricing } from '@/lib/plans'
import { formatEuro } from '@/lib/utils/money'
import { cn } from '@/lib/utils'
import { BillingDetailsSection } from './BillingDetailsSection'
import { CancelPlanDialog } from './CancelPlanDialog'
import { InvoicesSection } from './InvoicesSection'
import { PaymentMethodDialog } from './PaymentMethodDialog'
import { CHECK_TIMING, checkPaymentMethodUpdate, RETURN_WORDS } from './paymentMethodReturn'
import {
  calendarDay,
  formatCount,
  isPaid,
  isPlanNoLongerSold,
  pendingChangeLine,
  pendingChangeTiming,
  pendingRetentionLine,
  planEndsOn,
  planLine,
  planStateOf,
} from './planState'

// A Danger zone's button: coral words on a coral hairline, as every settings Danger zone draws it.
const DESTRUCTIVE_OUTLINE = 'border-destructive/40 text-destructive hover:border-destructive/60 hover:bg-destructive/10 hover:text-destructive'

/** While a cancellation waits behind the Undo bar, Cancel plan stays off: a second confirm would send the first. */
const CANCEL_KEY = 'billing:cancel'

const COULDNT_CANCEL = "Couldn't cancel the plan. Try again."
const COULDNT_RESUME = "Couldn't resume the plan. Try again."

function isOk(result: unknown): boolean {
  return typeof result === 'object' && result !== null && 'ok' in result && result.ok === true
}

/**
 * Billing (copy deck §10; rulings R24, R26, R35, R36): the plan with its one state, its numbers as the kit's figures
 * and what needs doing; the billing details; the invoices; and Cancel plan in a Danger zone after them. Everyone in
 * the team reads the page (`billing.view`, checked by the route); only the owner changes anything (`billing.manage`).
 */
export default function BillingPage() {
  const router = useRouter()
  const manage = useCan('billing.manage')
  // Somebody alone is billed as themselves; a team is billed as a team (PULSE-59).
  const alone = useTeamState() === 'alone'
  const { data: sub, error, isValidating, mutate } = useSubscription()
  const { data: catalog } = useSWR('plan-catalog', getCatalog)
  // Read beside the plan, not after it: loading, empty and failed are three different states of the list.
  const invoices = useSWR('billing-invoices', getInvoices)
  const { defer } = useUndo()
  const cancelWaiting = usePendingKeys().has(CANCEL_KEY)
  const [dialog, setDialog] = React.useState<'method' | 'cancel' | null>(null)
  const [resuming, setResuming] = React.useState(false)

  // Back from Mollie: its cancel address means the person cancelled. Its return address means only that they came
  // back, whatever happened there (copy deck §10.8.8), so the page asks the server and says only what it confirmed.
  // Without a definite answer the flag stays in the address, so a reload asks again, as the words say.
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const clearFlag = () => window.history.replaceState({}, '', window.location.pathname)
    if (params.get('payment_update_canceled') === 'true') {
      toast.info(RETURN_WORDS.cancelled)
      clearFlag()
      return
    }
    if (params.get('payment_updated') !== 'true') return
    const controller = new AbortController()
    void checkPaymentMethodUpdate(async () => (await getPaymentMethodUpdate()).state, {
      signal: controller.signal,
      timing: CHECK_TIMING,
      onSlow: (last) => (last === 'pending' ? toast.info(RETURN_WORDS.notConfirmed) : toast.error(RETURN_WORDS.couldntCheck)),
    }).then((result) => {
      switch (result) {
        case 'updated':
          toast.success(RETURN_WORDS.updated)
          void mutate()
          clearFlag()
          return
        case 'failed':
          toast.error(RETURN_WORDS.failed)
          clearFlag()
          return
        case 'none':
          // Nothing recorded to ask about (a checkout started before the server kept them): no claim either way.
          clearFlag()
          return
        case 'unresolved':
        case null:
          // Still unconfirmed after a minute (said at a few seconds), or the page is gone.
          return
      }
    })
    return () => controller.abort()
  }, [mutate])

  if (!sub) {
    // A failed read is never "the free plan": that told a paying team it had none.
    return error ? (
      <SettingsErrorState
        title="Couldn't load your plan"
        message="Your plan itself is fine. Try again."
        onRetry={() => mutate()}
        retrying={isValidating}
      />
    ) : (
      <SettingsLoadingState rows={4} />
    )
  }

  const now = new Date()
  const state = planStateOf(sub)
  const status = planLine(sub, state, { manage, alone, now })
  const paid = isPaid(state)
  const pastDue = state === 'past_due'
  const cancelling = state === 'cancelling'
  const next = calendarDay(sub.next_charge_on, now)
  const endsOn = planEndsOn(sub, now)
  const planName = formatPlanName(sub.plan_id)
  // R36: no Cancel plan while a payment is past due, as today; "at the end of the period" means nothing then.
  const offerCancel = manage && paid && !pastDue

  // Every event counts since 07-11-2026. The ceiling is the only point where counting stops; absent means unknown.
  const { usage, limit, ceiling } = eventMeter(sub)
  const atCeiling = ceiling !== null && usage !== null && usage >= ceiling
  const over = limit > 0 && usage !== null && usage > limit && !atCeiling
  const ask = manage ? 'Change plan to raise the limit.' : 'Ask the owner to change the plan.'

  const pricing = paid ? getPlanPricing(catalog, sub.plan_id, limit) : null
  const yearly = sub.billing_interval === 'year'

  const figures: { label: string; value: React.ReactNode }[] = []
  if (usage !== null && limit > 0) {
    const ratio = Math.min(1, usage / limit)
    figures.push({
      label: 'Events this month',
      value: (
        <>
          {formatCount(usage)}
          <span className="text-muted-foreground"> of {formatCount(limit)}</span>
          <span data-billing-bar="" aria-hidden="true" className="mt-2 block h-1 w-full max-w-48 overflow-hidden bg-muted">
            <span className={cn('block h-full', atCeiling ? 'bg-destructive' : 'bg-primary')} style={{ width: `${ratio * 100}%` }} />
          </span>
        </>
      ),
    })
  }
  if (typeof sub.sites_count === 'number') figures.push({ label: 'Sites', value: formatCount(sub.sites_count) })
  if (pricing) {
    figures.push({
      label: 'Price',
      value: (
        <>
          {yearly ? `${formatEuro(pricing.yearlyTotal)} a year` : `${formatEuro(pricing.monthly)} a month`}
          {/* D19: the price includes VAT; without it, under it. */}
          <span className="mt-0.5 block text-xs font-normal tracking-normal text-muted-foreground">
            {`${formatEuro(yearly ? pricing.yearlyBusiness : pricing.monthlyBusiness)} without VAT`}
          </span>
        </>
      ),
    })
  }

  const timing = pendingChangeTiming(sub, catalog)
  const retentionLine = pendingRetentionLine(sub)

  const doCancel = () => {
    // The plan stays as it is behind the Undo bar; the request goes when the 6 seconds run out (PUL-28).
    defer(whilePending(CANCEL_KEY, {
      message: 'Plan cancelled',
      commit: ({ keepalive }) => cancelSubscription(undefined, { keepalive }),
      onCommitted: async (result) => {
        if (!isOk(result)) {
          toast.error(COULDNT_CANCEL)
          return
        }
        // Painted at once, then read back: the server's answer is what the page shows.
        await mutate(
          (current: SubscriptionDetails | undefined) => (current ? { ...current, cancel_at_period_end: true } : current),
          { revalidate: true },
        )
      },
      onError: () => {
        toast.error(COULDNT_CANCEL)
      },
    }))
  }

  const resume = async () => {
    setResuming(true)
    try {
      const result = await resumeSubscription()
      if (result.requires_checkout) {
        toast.warning('This plan has already ended. Pick a plan to subscribe again.')
        router.push('/switch')
        return
      }
      if (!result.ok) {
        toast.error(COULDNT_RESUME)
        return
      }
      await mutate(
        (current: SubscriptionDetails | undefined) => (current ? { ...current, cancel_at_period_end: false } : current),
        { revalidate: true },
      )
      toast.success('Plan resumed')
    } catch (err) {
      toast.error(isPlanNoLongerSold(err) ? 'This plan is no longer sold. Pick a plan to subscribe again.' : COULDNT_RESUME)
    } finally {
      setResuming(false)
    }
  }

  // Shown to the owner, and to anyone once a billing email is on file. A free team with no billing row cannot keep
  // details yet (the server drops the address without one), so the owner of one is not offered the form.
  const showDetails = Boolean(sub.billing_email) || (manage && state !== 'free')

  return (
    <KitPage>
      {/* The page's one main button. Not while past due: Update payment method is the way out of that state. */}
      {manage && !pastDue && (
        <MastheadAction>
          <Button variant="default" data-billing-main="" onClick={() => router.push('/switch')}>
            {state === 'cancelled' ? 'Subscribe again' : state === 'free' ? 'Upgrade' : 'Change plan'}
          </Button>
        </MastheadAction>
      )}

      <KitSection
        title={`${planName} plan`}
        description={
          <>
            <span data-billing-line="" className="block">
              <KitStatus tone={status.tone}>{status.word}</KitStatus>
              {status.line ? <> · {status.line}</> : null}
            </span>
            {/* Past due already tells the admin and members to ask the owner. */}
            {!manage && !pastDue && (
              <span data-billing-owner-only="" className="mt-0.5 block">Only the owner can change billing.</span>
            )}
          </>
        }
        icon={<Package />}
      >
        <KitRows>
          {figures.length > 0 && (
            <div data-billing-facts="figures">
              <KitStats items={figures} />
            </div>
          )}
          {over && usage !== null && (
            <div data-billing-row="over">
              <KitRow
                state
                tone="orange"
                icon={<WarningCircle weight="fill" />}
                label={`You've used ${formatCount(usage)} of your plan's ${formatCount(limit)} events.`}
                caption={ceiling !== null ? `Pulse keeps counting up to ${formatCount(ceiling)}, then stops. ${ask}` : ask}
              />
            </div>
          )}
          {atCeiling && ceiling !== null && (
            <div data-billing-row="ceiling">
              <KitRow
                state
                tone="coral"
                icon={<WarningOctagon weight="fill" />}
                label={`Pulse stopped counting: you reached ${formatCount(ceiling)} events, twice your plan.`}
                caption={
                  manage
                    ? "Nothing new is counted until the plan changes or the count starts over. A bigger plan starts counting again once its payment goes through."
                    : "Nothing new is counted until the plan changes. Ask the owner to change it."
                }
              />
            </div>
          )}
          {sub.pending_plan_id && (
            <div data-billing-row="change">
              <KitRow
                state
                tone="orange"
                icon={<ArrowsClockwise weight="bold" />}
                label={pendingChangeLine(sub, timing, now)}
                caption={retentionLine ?? undefined}
              />
            </div>
          )}
          {manage && paid && (
            <div data-billing-row="payment">
              <KitRow
                label="Payment method"
                caption="Future charges use the method you add."
                control={
                  <Button variant="outline" size="sm" onClick={() => setDialog('method')} aria-haspopup="dialog">
                    Update payment method
                  </Button>
                }
              />
            </div>
          )}
          {/* R36: Resume plan sits in the plan, under the state line it undoes. */}
          {offerCancel && cancelling && (
            <div data-billing-row="resume">
              <KitRow
                label="Resume plan"
                caption={next ? `The plan carries on and renews on ${next}.` : 'The plan carries on.'}
                control={
                  <Button variant="outline" size="sm" onClick={resume} disabled={resuming}>
                    Resume plan
                  </Button>
                }
              />
            </div>
          )}
        </KitRows>
      </KitSection>

      {showDetails && <BillingDetailsSection subscription={sub} manage={manage} onSaved={() => mutate()} />}

      <InvoicesSection
        invoices={invoices.data}
        failed={Boolean(invoices.error)}
        retrying={invoices.isValidating}
        onRetry={() => void invoices.mutate()}
        now={now}
      />

      {/* R36: Cancel plan after the invoices. While the plan is cancelling it stays, dimmed (R24), its line saying when. */}
      {offerCancel && (
        <KitSection title="Danger zone" description="You have 6 seconds to undo it." tone="danger" icon={<Warning />}>
          <KitRows>
            <div data-billing-row="cancel">
              <KitRow
                label="Cancel plan"
                caption={
                  cancelling
                    ? endsOn
                      ? `The plan already ends on ${endsOn}.`
                      : 'The plan already ends at the end of this billing period.'
                    : next
                      ? `The plan runs until ${next}, and nothing more is charged.`
                      : 'The plan runs until the end of this billing period, and nothing more is charged.'
                }
                control={
                  <Button
                    variant="outline"
                    size="sm"
                    className={DESTRUCTIVE_OUTLINE}
                    disabled={cancelling || cancelWaiting}
                    onClick={() => setDialog('cancel')}
                    aria-haspopup="dialog"
                  >
                    Cancel plan
                  </Button>
                }
              />
            </div>
          </KitRows>
        </KitSection>
      )}

      {manage && paid && (
        <PaymentMethodDialog open={dialog === 'method'} onClose={() => setDialog(null)} pastDue={pastDue} />
      )}
      {offerCancel && (
        <CancelPlanDialog
          open={dialog === 'cancel'}
          onOpenChange={(open) => {
            if (!open) setDialog(null)
          }}
          planName={planName}
          endsOn={next}
          alone={alone}
          onConfirm={doCancel}
        />
      )}
    </KitPage>
  )
}
