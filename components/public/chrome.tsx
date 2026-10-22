import { buttonVariants } from '@ciphera-net/facet'
import { cn } from '@/lib/utils'
import { SIGNUP_HREF } from '@/components/public/links'

/**
 * The two things the demo adds to the product's chrome (PUL-34, D6): it says it is the live
 * demo, and it offers a way out of the demo into the product. A customer's link has neither
 * (the 02-09-2026 ruling removed the Powered-by badge from share links).
 */

/**
 * "Live demo": the estate's dot-and-word device, muted. Shown on every page of the demo, at every width. It is called
 * what the site calls it everywhere else, the live demo, never "sample data" (wording ruling, 22-10-2026).
 */
export function DemoLabel({ className }: { className?: string }) {
  return (
    <span
      className={cn('inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs text-neutral-500', className)}
      title="This is the live demo of Pulse Analytics."
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-500" aria-hidden="true" />
      Live demo
    </span>
  )
}

/**
 * The demo's one action. `target="_top"` so that inside the marketing page's frame it opens
 * the whole window rather than a sign-up form inside the device.
 */
export function TryPulseFreeButton({ className }: { className?: string }) {
  return (
    <a href={SIGNUP_HREF} target="_top" className={cn(buttonVariants({ size: 'sm' }), 'shrink-0 ease-apple', className)}>
      Try Pulse free
    </a>
  )
}
