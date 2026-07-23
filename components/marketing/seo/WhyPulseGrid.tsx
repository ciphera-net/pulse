import Link from 'next/link'
import { ArrowUpRightIcon, GithubIcon, GlobeIcon, SwissFlagIcon } from '@ciphera-net/facet'
import { Cookie } from '@phosphor-icons/react/dist/ssr'
import { HairlineGrid } from '@/components/marketing/system/HairlineGrid'

type Icon = React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>

interface Differentiator {
  icon: Icon
  title: string
  description: string
  proof?: { label: string; href: string; external?: boolean }
}

// The four constant differentiators behind every "why Pulse" comparison — the
// real, verifiable facts (EU/Belgian company · Swiss/EU residency · no banner ·
// open client + public demo). Shared across the /vs cluster so the positioning
// never drifts entry to entry.
const DIFFERENTIATORS: Differentiator[] = [
  {
    icon: GlobeIcon,
    title: 'An EU company, under EU law',
    description:
      'Pulse is operated by Ciphera BV, a Belgian company. Your analytics provider — and your GDPR and NIS2 jurisdiction — sits inside the EU, not offshore.',
    proof: { label: 'About Ciphera', href: '/about' },
  },
  {
    icon: SwissFlagIcon,
    title: 'Swiss / EU data residency',
    description:
      'Every byte of visitor data lives on Swiss and EU infrastructure — no transfer to the US, and no dependence on US-jurisdiction cloud providers.',
    proof: { label: 'EU web analytics', href: '/eu-web-analytics' },
  },
  {
    icon: Cookie,
    title: 'No cookies, no consent banner',
    description:
      'Pulse sets no cookies and does not fingerprint visitors, so it is exempt from ePrivacy consent — no banner, and it counts every visitor, not just the ones who opt in.',
    proof: { label: 'How cookieless works', href: '/cookieless-analytics' },
  },
  {
    icon: GithubIcon,
    title: 'Open client, public live demo',
    description:
      'The dashboard and tracking script are open (AGPL) on GitHub, and a real, no-login demo runs on our own traffic. You can verify every claim, not just take our word.',
    proof: { label: 'Open the live demo', href: '/demo' },
  },
]

const proofLinkClass =
  'mt-5 inline-flex items-center gap-1 font-mono text-xs text-primary transition-colors duration-150 hover:text-primary/80 motion-reduce:transition-none'

/**
 * The "Why teams pick Pulse" grid used on every /vs page — the four constant,
 * verifiable differentiators. Mirrors the home WhyPulse recipe (HairlineGrid of
 * bordered cards with a proof link) so the two surfaces read as one system.
 */
export function WhyPulseGrid() {
  return (
    <HairlineGrid columns={4} framed className="mt-12">
      {DIFFERENTIATORS.map(({ icon: Icon, title, description, proof }) => (
        <div key={title} className="flex flex-col bg-card p-6">
          <Icon aria-hidden={true} className="h-5 w-5 text-muted-foreground" />
          <p className="mt-4 text-sm font-semibold text-foreground">{title}</p>
          <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
          {proof &&
            (proof.external ? (
              <a href={proof.href} target="_blank" rel="noopener noreferrer" className={proofLinkClass}>
                {proof.label}
                <ArrowUpRightIcon aria-hidden="true" className="h-3 w-3" />
              </a>
            ) : (
              <Link href={proof.href} className={proofLinkClass}>
                {proof.label}
                <ArrowUpRightIcon aria-hidden="true" className="h-3 w-3" />
              </Link>
            ))}
        </div>
      ))}
    </HairlineGrid>
  )
}
