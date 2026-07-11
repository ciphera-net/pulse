import {
  CheckCircleIcon,
  EyeOffIcon,
  GithubIcon,
  LockClosedIcon,
} from '@ciphera-net/facet'

type Icon = React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>

interface Badge {
  icon: Icon
  label: string
}

const DEFAULT_BADGES: Badge[] = [
  { icon: EyeOffIcon, label: 'Cookie-free' },
  { icon: GithubIcon, label: 'Open source' },
  { icon: CheckCircleIcon, label: 'GDPR compliant' },
  { icon: LockClosedIcon, label: 'Under 2 KB script' },
]

interface TrustStripProps {
  badges?: Badge[]
  'aria-label'?: string
}

/**
 * The divided badge strip: `grid gap-px bg-border sm:grid-cols-4` so the 1px
 * gaps read as dividers; each cell is `bg-background` with a muted icon and a
 * foreground label. Full-bleed within the rail.
 */
export function TrustStrip({
  badges = DEFAULT_BADGES,
  'aria-label': ariaLabel = 'Compliance and trust',
}: TrustStripProps) {
  return (
    <section className="border-b border-border" aria-label={ariaLabel}>
      <div className="grid grid-cols-1 gap-px bg-border sm:grid-cols-4">
        {badges.map(({ icon: Icon, label }) => (
          <div
            key={label}
            className="flex items-center gap-2.5 bg-background px-5 py-4 sm:justify-center"
          >
            <Icon
              aria-hidden={true}
              className="h-[18px] w-[18px] shrink-0 text-muted-foreground"
            />
            <span className="text-sm font-medium text-foreground">{label}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
