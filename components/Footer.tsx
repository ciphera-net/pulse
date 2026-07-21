'use client'

import Link from 'next/link'
import Image from 'next/image'
import { GithubIcon, TwitterIcon, ArrowUpRightIcon } from '@ciphera-net/facet'
import { LinkedinLogo } from '@phosphor-icons/react/dist/ssr'
import { cdnUrl } from '@/lib/cdn'
import { Watermark } from '@/components/marketing/system/Watermark'

interface FooterProps {
  LinkComponent?: React.ElementType
  appName?: string
  isAuthenticated?: boolean
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
    heading: 'Resources',
    links: [
      { name: 'Installation', href: '/installation' },
      { name: 'FAQ', href: '/faq' },
      { name: 'Documentation', href: 'https://help.ciphera.net', external: true },
      { name: 'About', href: '/about' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { name: 'Privacy Policy', href: 'https://ciphera.net/#privacy', external: true },
      { name: 'Terms of Service', href: 'https://ciphera.net/#terms', external: true },
      { name: 'Contact', href: 'https://ciphera.net/contact', external: true },
    ],
  },
]

const LINK_CLASS =
  'inline-block py-1.5 text-sm text-foreground/80 transition-colors duration-fast motion-reduce:transition-none hover:text-foreground'

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

export function Footer({
  LinkComponent = Link,
  appName = 'Pulse',
  isAuthenticated = false,
}: FooterProps) {
  const Component = LinkComponent
  const year = new Date().getFullYear()

  // * Simple footer for authenticated users (dashboard chrome).
  if (isAuthenticated) {
    return (
      <footer className="mt-auto w-full border-t border-border py-8">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
            <div className="text-sm text-muted-foreground">
              © 2024-{year} Ciphera. All rights reserved.
            </div>
            <div className="flex gap-6 text-sm font-medium text-foreground/80">
              <Component href="/about" className="transition-colors duration-fast hover:text-foreground">
                Why {appName}
              </Component>
              <Component href="/changelog" className="transition-colors duration-fast hover:text-foreground">
                Changelog
              </Component>
              <Component href="/pricing" className="transition-colors duration-fast hover:text-foreground">
                Pricing
              </Component>
              <Component href="/faq" className="transition-colors duration-fast hover:text-foreground">
                FAQ
              </Component>
            </div>
          </div>
        </div>
      </footer>
    )
  }

  // * Comprehensive marketing footer — on the rail so the vertical lines run
  // * continuously from the header through every section into the footer.
  return (
    <footer className="border-t border-border">
      <div className="mx-auto w-full max-w-6xl sm:border-x sm:border-border">
        {/* Link grid */}
        <div className="px-6 py-16">
          <div className="grid gap-12 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
            {/* Brand column */}
            <div>
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
                <span className="font-display text-lg font-bold tracking-tight text-foreground">
                  Pulse
                </span>
              </Link>
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
                Simple, privacy-first web analytics. No cookies, no tracking, no
                consent banners — insight without surveillance.
              </p>
              <div className="mt-6 flex items-center gap-2">
                <a
                  href="https://github.com/ciphera-net"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Pulse on GitHub"
                  className="inline-flex h-9 w-9 items-center justify-center border border-border text-muted-foreground transition-colors duration-fast hover:text-foreground"
                >
                  <GithubIcon className="h-4 w-4" />
                </a>
                <a
                  href="https://x.com/CipheraNET"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Ciphera on X"
                  className="inline-flex h-9 w-9 items-center justify-center border border-border text-muted-foreground transition-colors duration-fast hover:text-foreground"
                >
                  <TwitterIcon className="h-4 w-4" />
                </a>
                <a
                  href="https://www.linkedin.com/company/ciphera/"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Ciphera on LinkedIn"
                  className="inline-flex h-9 w-9 items-center justify-center border border-border text-muted-foreground transition-colors duration-fast hover:text-foreground"
                >
                  <LinkedinLogo className="h-4 w-4" />
                </a>
              </div>
            </div>

            {/* Link columns */}
            {footerColumns.map((column) => (
              <div key={column.heading}>
                <h3 className="font-mono text-xs text-muted-foreground">
                  {column.heading}
                </h3>
                <ul className="mt-4 space-y-3">
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
              <p className="font-mono text-xs text-muted-foreground">
                Zero-knowledge · No tracking · Open source
              </p>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
