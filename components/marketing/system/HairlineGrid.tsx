import { cn } from '@/lib/cn'
import { cva, type VariantProps } from 'class-variance-authority'

/**
 * "+" corner mark pinned to a grid intersection — the Efferd grid motif.
 * Sharp, muted, decorative only (aria-hidden). Ported from the website's
 * decor-icon so the framed HairlineGrid variant carries the same corner marks.
 */
const decorIconVariants = cva(
  'pointer-events-none absolute z-[1] size-5 shrink-0 stroke-1 stroke-muted-foreground',
  {
    variants: {
      position: {
        'top-left':
          'top-0 left-0 -translate-x-[calc(50%+0.5px)] -translate-y-[calc(50%+0.5px)]',
        'top-right':
          'top-0 right-0 translate-x-[calc(50%+0.5px)] -translate-y-[calc(50%+0.5px)]',
        'bottom-right':
          'right-0 bottom-0 translate-x-[calc(50%+0.5px)] translate-y-[calc(50%+0.5px)]',
        'bottom-left':
          'bottom-0 left-0 -translate-x-[calc(50%+0.5px)] translate-y-[calc(50%+0.5px)]',
      },
    },
    defaultVariants: { position: 'top-left' },
  },
)

type DecorIconProps = React.ComponentProps<'svg'> &
  VariantProps<typeof decorIconVariants>

function DecorIcon({ position, className, ...props }: DecorIconProps) {
  return (
    <svg
      aria-hidden="true"
      className={cn(decorIconVariants({ position, className }))}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  )
}

/**
 * Horizontal hairline spanning the full width of its (relative) parent, with a
 * "+" decor mark pinned to each end. Decorative only (aria-hidden).
 */
function FullWidthDivider({
  position = 'top',
  className,
}: {
  position?: 'top' | 'bottom'
  className?: string
}) {
  const isTop = position === 'top'
  return (
    <div
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute inset-x-0 z-0 h-px bg-border',
        isTop ? 'top-0' : 'bottom-0',
        className,
      )}
    >
      <DecorIcon position={isTop ? 'top-left' : 'bottom-left'} />
      <DecorIcon position={isTop ? 'top-right' : 'bottom-right'} />
    </div>
  )
}

const COLUMN_CLASSES: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
}

interface HairlineGridProps extends React.ComponentProps<'div'> {
  /** Responsive column count (1–4). Defaults to 3. */
  columns?: 1 | 2 | 3 | 4
  /** Adds the bordered frame + top/bottom hairlines with "+" corner marks. */
  framed?: boolean
}

/**
 * The hairline-grid recipe: `grid gap-px bg-border` so the 1px gaps read as
 * dividing lines between `bg-card`/`bg-background` cells. The `framed` variant
 * wraps the grid in `border-x` plus top/bottom FullWidthDividers with corner
 * marks (the website's framed grid).
 */
export function HairlineGrid({
  columns = 3,
  framed = false,
  className,
  children,
  ...props
}: HairlineGridProps) {
  const grid = (
    <div
      className={cn('grid gap-px bg-border', COLUMN_CLASSES[columns], className)}
      {...props}
    >
      {children}
    </div>
  )

  if (!framed) return grid

  return (
    <div className="relative border-x border-border">
      <FullWidthDivider position="top" />
      {grid}
      <FullWidthDivider position="bottom" />
    </div>
  )
}
