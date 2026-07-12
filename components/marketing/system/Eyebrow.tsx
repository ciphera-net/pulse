import { cn } from '@/lib/cn'

interface EyebrowProps extends React.ComponentProps<'p'> {
  /** Zero-padded section number, e.g. "01". Renders as `NN · Label`. */
  number?: string
  label: string
}

/**
 * The mono eyebrow recipe. With a `number`, renders the numbered-section
 * grammar `NN · Label` (middle dot is U+00B7 with surrounding spaces);
 * without it, the plain label.
 */
export function Eyebrow({ number, label, className, ...props }: EyebrowProps) {
  return (
    <p
      className={cn('font-mono text-xs text-muted-foreground', className)}
      {...props}
    >
      {number ? `${number} · ${label}` : label}
    </p>
  )
}
