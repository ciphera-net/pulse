'use client'

import Link from 'next/link'
import Image from 'next/image'
import { GithubIcon, ArrowUpRightIcon } from '@ciphera-net/facet'
import { cdnUrl } from '@/lib/cdn'
import { Watermark } from '@/components/marketing/system/Watermark'

interface FooterProps {
  LinkComponent?: React.ElementType
}

type FooterLink = { name: string; href: string; external?: boolean }

const footerColumns: { heading: string; links: FooterLink[] }[] = [
  {
    heading: 'Product',
    links: [
      { name: 'Features', href: '/features' },
      { name: 'Pricing', href: '/pricing' },
      { name: 'Integrations', href: '/integrations' },
      { name: 'Changelog', href: '/changelog' },
    ],
  },
  {
    heading: 'Compare',
    links: [
      { name: 'vs Google Analytics', href: '/vs/google-analytics' },
      { name: 'vs Plausible', href: '/vs/plausible' },
      { name: 'vs Matomo', href: '/vs/matomo' },
      { name: 'vs Fathom', href: '/vs/fathom' },
      { name: 'vs Simple Analytics', href: '/vs/simple-analytics' },
      { name: 'vs Umami', href: '/vs/umami' },
    ],
  },
  {
    heading: 'Guides',
    links: [
      { name: 'Cookieless analytics', href: '/cookieless-analytics' },
      { name: 'GDPR-compliant analytics', href: '/gdpr-compliant-analytics' },
      { name: 'GA alternative', href: '/google-analytics-alternative' },
      { name: 'No cookie banner', href: '/analytics-without-cookie-banner' },
      { name: 'EU web analytics', href: '/eu-web-analytics' },
    ],
  },
  {
    heading: 'Resources',
    links: [
      { name: 'Installation', href: '/installation' },
      { name: 'FAQ', href: '/faq' },
      { name: 'UTM builder', href: '/tools/utm-builder' },
      { name: 'Cookie-banner calculator', href: '/tools/cookie-banner-loss-calculator' },
      { name: 'Documentation', href: 'https://help.ciphera.net/docs/pulse', external: true },
      { name: 'About', href: '/about' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { name: 'Privacy Policy', href: 'https://ciphera.net/privacy', external: true },
      { name: 'Terms of Service', href: 'https://ciphera.net/terms', external: true },
      { name: 'Contact', href: '/contact' },
    ],
  },
]

const LINK_CLASS =
  'inline-block py-3 md:py-1.5 text-sm text-foreground/80 transition-colors duration-fast motion-reduce:transition-none hover:text-foreground'

function FooterLinkItem({
  link,
  Component,
}: {
  link: FooterLink
  Component: React.ElementType
}) {
  if (link.external) {
    return (
      <a
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        className={LINK_CLASS}
      >
        {link.name}
        <ArrowUpRightIcon aria-hidden="true" className="ml-1 inline h-3 w-3" />
      </a>
    )
  }
  return (
    <Component href={link.href} className={LINK_CLASS}>
      {link.name}
    </Component>
  )
}

export function Footer({ LinkComponent = Link }: FooterProps) {
  const Component = LinkComponent
  const year = new Date().getFullYear()

  // (The old `isAuthenticated` variant was dead code — the sole call site
  // hardcoded false. In-app legal links live in the settings nav instead.)

  // * Comprehensive marketing footer — on the rail so the vertical lines run
  // * continuously from the header through every section into the footer.
  return (
    <footer className="border-t border-border">
      <div className="mx-auto w-full max-w-6xl sm:border-x sm:border-border">
        {/* Link grid */}
        <div className="px-6 py-16">
          <div className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-3 lg:grid-cols-[1.5fr_repeat(5,1fr)]">
            {/* Brand column — spans the full row on small screens */}
            <div className="col-span-2 sm:col-span-3 lg:col-span-1">
              <Link href="/" className="flex items-center gap-2">
                <Image
                  src={cdnUrl('/pulse_icon_no_margins.png')}
                  alt=""
                  width={28}
                  height={28}
                  loading="lazy"
                  className="h-7 w-7 object-contain"
                  unoptimized
                />
                <span className="font-display text-lg font-semibold tracking-tight text-foreground">
                  Pulse
                </span>
              </Link>
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
                Simple, privacy-first web analytics. No cookies, no tracking, no
                consent banners — insight without surveillance.
              </p>
              {/* Social block mirrors ciphera-website's Footer verbatim: same
                  order (GitHub, LinkedIn, X, Discord), same inline SVG glyphs, same
                  hover treatment — the estate has ONE social-icon row. */}
              <div className="mt-6 flex items-center gap-2">
                <a
                  href="https://github.com/ciphera-net"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Ciphera on GitHub"
                  className="inline-flex h-11 w-11 md:h-9 md:w-9 items-center justify-center border border-border text-muted-foreground transition-colors duration-fast hover:border-line-hover hover:text-foreground"
                >
                  <GithubIcon className="h-4 w-4" />
                </a>
                <a
                  href="https://www.linkedin.com/company/ciphera/"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Ciphera on LinkedIn"
                  className="inline-flex h-11 w-11 md:h-9 md:w-9 items-center justify-center border border-border text-muted-foreground transition-colors duration-fast hover:border-line-hover hover:text-foreground"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-4 w-4">
                    <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.8 0 0 .78 0 1.74v20.52C0 23.22.8 24 1.77 24h20.45c.98 0 1.78-.78 1.78-1.74V1.74C24 .78 23.2 0 22.22 0z" />
                  </svg>
                </a>
                <a
                  href="https://x.com/CipheraNET"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Ciphera on X"
                  className="inline-flex h-11 w-11 md:h-9 md:w-9 items-center justify-center border border-border text-muted-foreground transition-colors duration-fast hover:border-line-hover hover:text-foreground"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-4 w-4">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                </a>
                <a
                  href="https://discord.gg/XRSkHCDD4x"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Ciphera on Discord"
                  className="inline-flex h-11 w-11 md:h-9 md:w-9 items-center justify-center border border-border text-muted-foreground transition-colors duration-fast hover:border-line-hover hover:text-foreground"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-4 w-4">
                    <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.058a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.331c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                  </svg>
                </a>
              </div>
            </div>

            {/* Link columns */}
            {footerColumns.map((column) => (
              <div key={column.heading}>
                <h3 className="text-xs text-muted-foreground">
                  {column.heading}
                </h3>
                {/* The links now carry py-3 below md for a 44px target, so the
                    list drops its own gap there — otherwise the footer would
                    grow by ~24px per link on the smallest screen. md+ keeps the
                    py-1.5 link and the space-y-3 rhythm exactly as before. */}
                <ul className="mt-4 space-y-0 md:space-y-3">
                  {column.links.map((link) => (
                    <li key={link.name}>
                      <FooterLinkItem link={link} Component={Component} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Typographic signature */}
        <Watermark />

        {/* Bottom bar */}
        <div>
          <div className="px-6 py-6">
            <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
              <p className="text-xs text-muted-foreground">
                © 2024–{year} Ciphera. All rights reserved.
              </p>
              <p className="text-xs text-muted-foreground">
                A{' '}
                <a
                  href="https://ciphera.net"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground/80 underline decoration-dotted underline-offset-2 transition-colors duration-fast hover:text-foreground"
                >
                  Ciphera
                </a>{' '}
                product
              </p>
              <p className="text-xs text-muted-foreground">
                Ciphera BV &middot; KBO/BCE 1013.721.660 &middot; De Kleetlaan 2, 1831 Diegem,
                Belgium
              </p>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
