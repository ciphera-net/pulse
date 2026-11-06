'use client'

import * as React from 'react'
import { Input, toast } from '@ciphera-net/facet'
import { IdentificationCard } from '@phosphor-icons/react'
import { KitRow, KitRows, KitSection } from '@/components/settings/kit/Kit'
import SettingsSaveBar from '@/components/settings/SettingsSaveBar'
import { updateBillingSettings, type SubscriptionDetails } from '@/lib/api/billing'

interface DetailsFields {
  business_name: string
  billing_email: string
  address: string
  city: string
  postal_code: string
}

function fieldsOf(sub: SubscriptionDetails): DetailsFields {
  return {
    business_name: sub.business_name ?? '',
    billing_email: sub.billing_email ?? '',
    address: sub.billing_address ?? '',
    city: sub.billing_city ?? '',
    postal_code: sub.billing_postal_code ?? '',
  }
}

const FIELDS: { key: keyof DetailsFields; id: string; label: string; placeholder: string; type?: string; caption?: string }[] = [
  { key: 'business_name', id: 'bd-business-name', label: 'Business name', placeholder: 'Business name' },
  {
    key: 'billing_email', id: 'bd-billing-email', label: 'Billing email', placeholder: 'billing@example.com', type: 'email',
    caption: 'Invoices and failed-payment emails go here.',
  },
  { key: 'address', id: 'bd-address', label: 'Address', placeholder: 'Street address' },
  { key: 'city', id: 'bd-city', label: 'City', placeholder: 'City' },
  { key: 'postal_code', id: 'bd-postal-code', label: 'Postal code', placeholder: 'Postal code' },
]

const COULDNT_SAVE = "Couldn't save your billing details. Try again."

/**
 * Business name, billing email and address (copy deck §10.6). The owner edits them with the page's save bar; the
 * admin and members read them. The draft starts from the first answer and is kept through later refreshes of the plan
 * (the cancel and resume flows revalidate it), so an edit in progress is never overwritten.
 */
export function BillingDetailsSection({
  subscription,
  manage,
  onSaved,
}: {
  subscription: SubscriptionDetails
  manage: boolean
  onSaved: () => Promise<unknown>
}) {
  const [baseline, setBaseline] = React.useState<DetailsFields>(() => fieldsOf(subscription))
  const [draft, setDraft] = React.useState<DetailsFields>(baseline)
  const dirty = FIELDS.some(({ key }) => draft[key] !== baseline[key])

  const save = async () => {
    // Only what changed: the server leaves an absent field alone, and refuses an empty billing email, so sending all
    // five made a business name unsavable on a plan that has no billing email yet.
    const changes: Partial<DetailsFields> = {}
    for (const { key } of FIELDS) if (draft[key] !== baseline[key]) changes[key] = draft[key]
    let ok: boolean
    try {
      ok = (await updateBillingSettings(changes)).ok
    } catch {
      // A refused or failed request reads as the same failure as `ok: false`: the words below, and the draft kept.
      ok = false
    }
    if (!ok) {
      toast.error(COULDNT_SAVE)
      // Rejecting keeps the draft and stops the save bar from saying "Saved".
      throw new Error('billing details not saved')
    }
    setBaseline(draft)
    await onSaved()
    toast.success('Billing details saved')
  }

  const hasEmail = Boolean(subscription.billing_email)
  const description = !manage
    ? undefined
    : !hasEmail
      ? 'Add your business name and address to put them on your invoices.'
      : subscription.tax_id
        ? 'To change your country or VAT ID, contact support.'
        : undefined

  if (!manage) {
    const place = [subscription.billing_postal_code, subscription.billing_city].filter(Boolean).join(' ')
    const address = [subscription.billing_address, place].filter(Boolean).join(', ')
    return (
      <KitSection title="Billing details" icon={<IdentificationCard />}>
        <KitRows>
          {subscription.business_name && (
            <KitRow label="Business name">
              <span className="block text-sm text-foreground">{subscription.business_name}</span>
            </KitRow>
          )}
          <KitRow label="Billing email">
            <span className="block text-sm text-foreground">{subscription.billing_email}</span>
          </KitRow>
          {address && (
            <KitRow label="Address">
              <span className="block text-sm text-foreground">{address}</span>
            </KitRow>
          )}
        </KitRows>
      </KitSection>
    )
  }

  return (
    <>
      <KitSection title="Billing details" description={description} icon={<IdentificationCard />}>
        <KitRows>
          {FIELDS.map((f) => (
            <KitRow key={f.key} label={f.label} htmlFor={f.id} caption={f.caption}>
              <Input
                id={f.id}
                type={f.type ?? 'text'}
                value={draft[f.key]}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
              />
            </KitRow>
          ))}
        </KitRows>
      </KitSection>
      <SettingsSaveBar isDirty={dirty} onSave={save} onDiscard={() => setDraft(baseline)} saveLabel="Save billing details" />
    </>
  )
}
