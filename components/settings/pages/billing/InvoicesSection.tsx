'use client'

import type { ReactNode } from 'react'
import { Button, toast } from '@ciphera-net/facet'
import { DownloadSimple, Receipt } from '@phosphor-icons/react'
import { KitBlock, KitRow, KitRows, KitSection, KitStatus } from '@/components/settings/kit/Kit'
import { SettingsErrorState } from '@/components/settings/SettingsErrorState'
import SettingsLoadingState from '@/components/settings/SettingsLoadingState'
import { downloadInvoicePDF, type Invoice } from '@/lib/api/billing'
import { ApiError } from '@/lib/api/client'
import { formatMoneyCents } from '@/lib/utils/money'
import { invoiceStatus, utcDay } from './planState'

function download(id: string) {
  downloadInvoicePDF(id).catch((err: unknown) => {
    // A 404 is a document Odoo has not made yet; anything else is a failure to say plainly.
    toast.error(
      err instanceof ApiError && err.status === 404
        ? "This invoice isn't ready yet. Try again in a few minutes."
        : "Couldn't download the invoice. Try again.",
    )
  })
}

/**
 * The invoices as R24 rows, newest first. A row is named by its date: most invoices have no number yet (13 of 15 on
 * 06-11-2026, copy deck §10.9), so the number joins the line when there is one. Loading, empty and failed are three
 * different states, never one.
 */
export function InvoicesSection({
  invoices,
  failed,
  retrying,
  onRetry,
  now,
}: {
  /** Undefined until the first answer. */
  invoices: Invoice[] | undefined
  failed: boolean
  retrying: boolean
  onRetry: () => void
  now: Date
}) {
  let body: ReactNode
  if (!invoices && failed) {
    body = (
      <KitBlock>
        <SettingsErrorState variant="banner" message="Couldn't load your invoices. Try again." onRetry={onRetry} retrying={retrying} />
      </KitBlock>
    )
  } else if (!invoices) {
    body = (
      <KitBlock>
        <SettingsLoadingState rows={2} />
      </KitBlock>
    )
  } else if (invoices.length === 0) {
    body = (
      <KitRows>
        <KitRow label="No invoices yet" caption="Your first one shows here after your first payment." />
      </KitRows>
    )
  } else {
    const newestFirst = [...invoices].sort((a, b) => b.created_at.localeCompare(a.created_at))
    body = (
      <KitRows>
        {newestFirst.map((inv) => {
          const credit = inv.document_type === 'credit_note'
          const status = invoiceStatus(inv)
          const money = (cents: number) => formatMoneyCents(Math.abs(cents), inv.currency)
          return (
            <div key={inv.id} data-billing-invoice={credit ? 'credit' : inv.status}>
              <KitRow
                label={utcDay(inv.created_at, now, true) ?? 'Invoice'}
                caption={
                  <>
                    <KitStatus tone={status.tone}>{status.word}</KitStatus>
                    {` · ${credit ? '−' : ''}${money(inv.total_cents)} · ${credit ? 'refund' : 'incl.'} ${money(inv.vat_cents)} VAT`}
                    {inv.invoice_number && (
                      <>
                        {' · '}
                        <span className="font-mono">{inv.invoice_number}</span>
                      </>
                    )}
                  </>
                }
                control={
                  // R24: the glyph sits on the section's right edge; a 16 px glyph in a 32 px button is inset 8 px.
                  <Button
                    variant="ghost"
                    size="icon"
                    className="-mr-2 h-8 w-8 text-muted-foreground hover:bg-accent hover:text-foreground"
                    aria-label="Download invoice"
                    onClick={() => download(inv.id)}
                  >
                    <DownloadSimple className="h-4 w-4" />
                  </Button>
                }
              />
            </div>
          )
        })}
      </KitRows>
    )
  }

  return (
    <KitSection title="Invoices" icon={<Receipt />}>
      {body}
    </KitSection>
  )
}
