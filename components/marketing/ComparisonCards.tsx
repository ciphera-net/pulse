import Image from 'next/image'
import { CheckIcon, XIcon } from '@ciphera-net/facet'
import { cdnUrl } from '@/lib/cdn'

// Sentiment kept: a green check reads "yes/good", a red X reads "no/tradeoff".
// Pulse's own column leads with the primary accent on its top edge.
const pulseFeatures = [
  { label: 'No cookies required', has: true },
  { label: 'GDPR compliant by default', has: true },
  { label: 'No consent banner needed', has: true },
  { label: 'Open source client', has: true },
  { label: 'Script under 2KB', has: true },
  { label: 'Swiss infrastructure', has: true },
  { label: 'No cross-site tracking', has: true },
  { label: 'Free tier available', has: true },
  { label: 'Real-time dashboard', has: true },
]

const gaFeatures = [
  { label: 'Requires cookies', has: false },
  { label: 'GDPR requires configuration', has: false },
  { label: 'Consent banner required', has: false },
  { label: 'Closed source', has: false },
  { label: 'Script over 45KB', has: false },
  { label: 'US infrastructure', has: false },
  { label: 'Cross-site tracking', has: false },
  { label: 'Free tier available', has: true },
  { label: 'Real-time dashboard', has: true },
]

export default function ComparisonCards() {
  return (
    <div className="mt-12 grid gap-px border border-border bg-border md:grid-cols-2">
      {/* Pulse — highlighted with the primary top edge */}
      <div className="relative bg-card p-8">
        <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[3px] bg-primary" />
        <div className="mb-6 flex items-center gap-3">
          <Image
            src={cdnUrl('/pulse_icon_no_margins.png')}
            alt="Pulse"
            width={40}
            height={40}
            unoptimized
          />
          <div>
            <h3 className="text-xl font-bold text-foreground">Pulse</h3>
            <p className="text-xs text-primary">Privacy-first analytics</p>
          </div>
        </div>
        <ul className="space-y-4">
          {pulseFeatures.map((f) => (
            <li key={f.label} className="flex items-center gap-3">
              <CheckIcon aria-hidden="true" className="h-5 w-5 shrink-0 text-green-500" />
              <span className="text-sm text-foreground/90">{f.label}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Google Analytics — muted */}
      <div className="bg-background p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center border border-border bg-muted text-lg">
            📊
          </div>
          <div>
            <h3 className="text-xl font-bold text-foreground">Google Analytics</h3>
            <p className="text-xs text-muted-foreground">Traditional tracking</p>
          </div>
        </div>
        <ul className="space-y-4">
          {gaFeatures.map((f) => (
            <li key={f.label} className="flex items-center gap-3">
              {f.has ? (
                <CheckIcon aria-hidden="true" className="h-5 w-5 shrink-0 text-green-500" />
              ) : (
                <XIcon aria-hidden="true" className="h-5 w-5 shrink-0 text-red-500" />
              )}
              <span className="text-sm text-muted-foreground">{f.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
