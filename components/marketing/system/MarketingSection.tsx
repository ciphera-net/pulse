import { cn } from '@/lib/cn'
import { Eyebrow } from './Eyebrow'

interface MarketingSectionProps extends React.ComponentProps<'section'> {
  /** Zero-padded section number for the eyebrow, e.g. "01". */
  eyebrowNumber?: string
  /** Eyebrow label. When set, the numbered header block renders. */
  eyebrowLabel?: string
  /** Section heading (renders an <h2>). */
  heading?: React.ReactNode
  /** Optional dek beneath the heading. */
  dek?: React.ReactNode
  /** Class applied to the inner padded container (defaults keep the recipe). */
  innerClassName?: string
}

/**
 * Full-bleed bordered section slab. `border-b border-border` full width so the
 * horizontal hairline spans past the rail; inner content sits in `px-6 py-16
 * sm:py-20`. The optional numbered header (eyebrow → h2 → dek) uses the exact
 * recipe-book scales.
 */
export function MarketingSection({
  eyebrowNumber,
  eyebrowLabel,
  heading,
  dek,
  innerClassName,
  className,
  children,
  ...props
}: MarketingSectionProps) {
  return (
    <section className={cn('border-b border-border', className)} {...props}>
      <div className={cn('px-6 py-16 sm:py-20', innerClassName)}>
        {(eyebrowLabel || heading) && (
          <div>
            {eyebrowLabel && (
              <Eyebrow number={eyebrowNumber} label={eyebrowLabel} />
            )}
            {heading && (
              <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                {heading}
              </h2>
            )}
            {dek && (
              <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
                {dek}
              </p>
            )}
          </div>
        )}
        {children}
      </div>
    </section>
  )
}
