import Link from 'next/link'
import {
  ArrowUpRightIcon,
  CheckCircleIcon,
  GithubIcon,
} from '@ciphera-net/facet'
import { Cookie, Lightning } from '@phosphor-icons/react/dist/ssr'
import { HairlineGrid } from './system/HairlineGrid'

type Icon = React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>

interface WhyFeature {
  icon: Icon
  title: string
  description: string
  proof?: { label: string; href: string; external?: boolean }
}

// Four claims, each paired with proof where a real link exists. Copy reuses the
// home's privacy positioning (the ComparisonCards intro's "privacy-first
// analytics doesn't mean less insight" thesis, expanded into receipts).
const FEATURES: WhyFeature[] = [
  {
    icon: Cookie,
    title: 'No cookies, no consent banner',
    description:
      "Pulse doesn't set cookies or fingerprint visitors, so it's exempt from ePrivacy consent requirements. No banner, no friction.",
    proof: { label: 'Privacy FAQ', href: '/faq' },
  },
  {
    icon: CheckCircleIcon,
    title: 'GDPR compliant by architecture',
    description:
      'No personal data is collected as defined by GDPR Article 4. Compliance is structural — not a checkbox you have to configure.',
    proof: { label: 'How it works', href: '/about' },
  },
  {
    icon: GithubIcon,
    title: 'Open source client',
    description:
      'The dashboard and tracking script are public on GitHub. Inspect every line that runs on your site and verify the claims yourself.',
    proof: { label: 'Read the code', href: 'https://github.com/ciphera-net/pulse', external: true },
  },
  {
    icon: Lightning,
    title: 'Under 2 KB, Swiss-hosted',
    description:
      'The script is roughly 20× smaller than Google Analytics and loads async — and every byte of data lives on Swiss infrastructure.',
    proof: { label: 'View pricing', href: '/pricing' },
  },
]

const proofLinkClass =
  'mt-5 inline-flex items-center gap-1 text-xs text-primary transition-colors duration-150 hover:text-primary/80 motion-reduce:transition-none'

export function WhyPulse() {
  return (
    <HairlineGrid columns={4} framed className="mt-12">
      {FEATURES.map(({ icon: Icon, title, description, proof }) => (
        <div key={title} className="flex flex-col bg-card p-6">
          <Icon aria-hidden={true} className="h-5 w-5 text-muted-foreground" />
          <p className="mt-4 text-sm font-semibold text-foreground">{title}</p>
          <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
          {proof &&
            (proof.external ? (
              <a
                href={proof.href}
                target="_blank"
                rel="noopener noreferrer"
                className={proofLinkClass}
              >
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
