import Link from 'next/link'
import { ArrowUpRightIcon } from '@ciphera-net/facet'

/**
 * The numbered claims-with-proof ledger — the estate's device for guarantees
 * (established on /features "Guarantees, with receipts.", reused on /about).
 * Each row: primary tabular index, claim, substance, and the link that proves
 * it. Prefer this over guarantee grids or bare claim chips.
 */

export interface ReceiptProof {
  label: string
  href: string
  external?: boolean
}

export interface Receipt {
  title: string
  description: string
  proof: ReceiptProof
}

const proofLinkClass =
  '-my-2.5 py-2.5 md:my-0 md:py-0 inline-flex items-center gap-1 text-xs text-primary transition-colors duration-150 hover:text-primary/80 motion-reduce:transition-none'

export function ProofLink({ proof, className }: { proof: ReceiptProof; className?: string }) {
  const cls = className ? `${proofLinkClass} ${className}` : proofLinkClass
  if (proof.external) {
    return (
      <a href={proof.href} target="_blank" rel="noopener noreferrer" className={cls}>
        {proof.label}
        <ArrowUpRightIcon aria-hidden="true" className="h-3 w-3" />
      </a>
    )
  }
  return (
    <Link href={proof.href} className={cls}>
      {proof.label}
      <ArrowUpRightIcon aria-hidden="true" className="h-3 w-3" />
    </Link>
  )
}

export function ReceiptsLedger({ receipts }: { receipts: Receipt[] }) {
  return (
    <div className="mt-12 border-t border-border">
      {receipts.map((r, i) => (
        <div
          key={r.title}
          className="grid grid-cols-[auto_1fr] items-baseline gap-x-6 gap-y-1 border-b border-border py-5 sm:grid-cols-[3rem_14rem_1fr_auto] sm:gap-x-8"
        >
          <span className="text-xs tabular-nums text-primary">
            {String(i + 1).padStart(2, '0')}
          </span>
          <p className="text-sm font-semibold text-foreground">{r.title}</p>
          <p className="col-start-2 text-sm leading-relaxed text-muted-foreground sm:col-start-3">
            {r.description}
          </p>
          <div className="col-start-2 sm:col-start-4 sm:justify-self-end">
            <ProofLink proof={r.proof} />
          </div>
        </div>
      ))}
    </div>
  )
}
