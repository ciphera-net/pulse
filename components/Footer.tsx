'use client'

import Link from 'next/link'
import Image from 'next/image'
import { GithubIcon, TwitterIcon, SwissFlagIcon } from '@ciphera-net/ui'

interface FooterProps {
  LinkComponent?: React.ElementType
  appName?: string
  isAuthenticated?: boolean
}

const footerLinks = {
  products: [
    { name: 'Drop', href: 'https://drop.ciphera.net', external: true },
    { name: 'Pulse', href: 'https://pulse.ciphera.net', external: true },
    { name: 'Ciphera Auth', href: 'https://ciphera.net/products#auth', external: true },
    { name: 'Ciphera Captcha', href: 'https://ciphera.net/products#captcha', external: true },
    { name: 'Ciphera Relay', href: 'https://ciphera.net/products#relay', external: true },
  ],
  company: [
    { name: 'Features', href: '/features', external: false },
    { name: 'About', href: '/about', external: false },
    { name: 'Pricing', href: '/pricing', external: false },
    { name: 'Contact', href: 'https://ciphera.net/contact', external: true },
  ],
  resources: [
    { name: 'Changelog', href: '/changelog', external: false },
    { name: 'Installation', href: '/installation', external: false },
    { name: 'Integrations', href: '/integrations', external: false },
    { name: 'Documentation', href: 'https://docs.ciphera.net', external: true },
    { name: 'Status', href: 'https://status.ciphera.net', external: true },
    { name: 'GitHub', href: 'https://github.com/ciphera-net', external: true },
  ],
  legal: [
    { name: 'Privacy Policy', href: 'https://ciphera.net/#privacy', external: true },
    { name: 'Terms of Service', href: 'https://ciphera.net/#terms', external: true },
  ],
}

export function Footer({ LinkComponent = Link, appName = 'Pulse', isAuthenticated = false }: FooterProps) {
  const Component = LinkComponent
  const year = new Date().getFullYear()

  // * Simple footer for authenticated users
  if (isAuthenticated) {
    return (
      <footer className="w-full py-8 mt-auto border-t border-neutral-100 dark:border-neutral-800 bg-white/50 dark:bg-neutral-900/50 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="text-sm text-neutral-500 dark:text-neutral-400">
              © 2024-{year} Ciphera. All rights reserved.
            </div>
            <div className="flex gap-6 text-sm font-medium text-neutral-600 dark:text-neutral-300">
              <Component href="/about" className="hover:text-brand-orange transition-colors focus:outline-none focus:ring-2 focus:ring-brand-orange focus:rounded">
                Why {appName}
              </Component>
              <Component href="/changelog" className="hover:text-brand-orange transition-colors focus:outline-none focus:ring-2 focus:ring-brand-orange focus:rounded">
                Changelog
              </Component>
              <Component href="/pricing" className="hover:text-brand-orange transition-colors focus:outline-none focus:ring-2 focus:ring-brand-orange focus:rounded">
                Pricing
              </Component>
              <Component href="/faq" className="hover:text-brand-orange transition-colors focus:outline-none focus:ring-2 focus:ring-brand-orange focus:rounded">
                FAQ
              </Component>
            </div>
          </div>
        </div>
      </footer>
    )
  }

  // * Comprehensive footer for unauthenticated users
  return (
    <footer className="w-full mt-auto border-t border-neutral-100 dark:border-neutral-800 bg-white/50 dark:bg-neutral-900/50 backdrop-blur-sm">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12 lg:py-16">
        {/* * Main footer content */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6 sm:gap-8 lg:gap-12">
          {/* * Brand column */}
          <div className="col-span-1 sm:col-span-2 md:col-span-4 lg:col-span-1 lg:pr-8">
            <Link href="/" className="flex items-center gap-3 mb-4 group">
              <Image
                src="/pulse_icon_no_margins.png"
                alt="Pulse privacy-first analytics logo"
                width={36}
                height={36}
                loading="lazy"
                className="w-9 h-9 object-contain group-hover:scale-105 transition-transform duration-300"
              />
              <span className="text-xl font-bold text-neutral-900 dark:text-white group-hover:text-brand-orange transition-colors duration-300">
                Pulse
              </span>
            </Link>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4 leading-relaxed">
              Simple analytics for privacy-conscious apps.
            </p>
            <div className="inline-flex items-center gap-3 text-sm text-neutral-600 dark:text-neutral-400 mb-4">
              <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-neutral-100 dark:bg-neutral-800 shrink-0 overflow-hidden ring-1 ring-neutral-200 dark:ring-neutral-700" aria-hidden>
                <SwissFlagIcon className="w-5 h-5" />
              </span>
              <span>Swiss infrastructure</span>
            </div>
            <div className="flex items-center gap-3">
              <a
                href="https://github.com/ciphera-net"
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-lg bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-600 dark:text-neutral-400 hover:text-brand-orange dark:hover:text-brand-orange hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-orange"
                aria-label="GitHub"
              >
                <GithubIcon className="w-5 h-5" />
              </a>
              <a
                href="https://x.com/cipheranet"
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-lg bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-600 dark:text-neutral-400 hover:text-brand-orange dark:hover:text-brand-orange hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-orange"
                aria-label="X (Twitter)"
              >
                <TwitterIcon className="w-5 h-5" />
              </a>
            </div>
          </div>

          {/* * Products */}
          <div>
            <h4 className="font-semibold text-neutral-900 dark:text-white mb-4">Products</h4>
            <ul className="space-y-3">
              {footerLinks.products.map((link) => (
                <li key={link.name}>
                  {link.external ? (
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-neutral-600 dark:text-neutral-400 hover:text-brand-orange dark:hover:text-brand-orange transition-colors focus:outline-none focus:ring-2 focus:ring-brand-orange focus:rounded"
                    >
                      {link.name}
                    </a>
                  ) : (
                    <Component
                      href={link.href}
                      className="text-sm text-neutral-600 dark:text-neutral-400 hover:text-brand-orange dark:hover:text-brand-orange transition-colors focus:outline-none focus:ring-2 focus:ring-brand-orange focus:rounded"
                    >
                      {link.name}
                    </Component>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* * Company */}
          <div>
            <h4 className="font-semibold text-neutral-900 dark:text-white mb-4">Company</h4>
            <ul className="space-y-3">
              {footerLinks.company.map((link) => (
                <li key={link.name}>
                  {link.external ? (
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-neutral-600 dark:text-neutral-400 hover:text-brand-orange dark:hover:text-brand-orange transition-colors focus:outline-none focus:ring-2 focus:ring-brand-orange focus:rounded"
                    >
                      {link.name}
                    </a>
                  ) : (
                    <Component
                      href={link.href}
                      className="text-sm text-neutral-600 dark:text-neutral-400 hover:text-brand-orange dark:hover:text-brand-orange transition-colors focus:outline-none focus:ring-2 focus:ring-brand-orange focus:rounded"
                    >
                      {link.name}
                    </Component>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* * Resources */}
          <div>
            <h4 className="font-semibold text-neutral-900 dark:text-white mb-4">Resources</h4>
            <ul className="space-y-3">
              {footerLinks.resources.map((link) => (
                <li key={link.name}>
                  {link.external ? (
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-neutral-600 dark:text-neutral-400 hover:text-brand-orange dark:hover:text-brand-orange transition-colors focus:outline-none focus:ring-2 focus:ring-brand-orange focus:rounded"
                    >
                      {link.name}
                    </a>
                  ) : (
                    <Component
                      href={link.href}
                      className="text-sm text-neutral-600 dark:text-neutral-400 hover:text-brand-orange dark:hover:text-brand-orange transition-colors focus:outline-none focus:ring-2 focus:ring-brand-orange focus:rounded"
                    >
                      {link.name}
                    </Component>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* * Legal */}
          <div>
            <h4 className="font-semibold text-neutral-900 dark:text-white mb-4">Legal</h4>
            <ul className="space-y-3">
              {footerLinks.legal.map((link) => (
                <li key={link.name}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-neutral-600 dark:text-neutral-400 hover:text-brand-orange dark:hover:text-brand-orange transition-colors"
                  >
                    {link.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* * Divider */}
        <div className="h-px w-full bg-gradient-to-r from-transparent via-neutral-200 dark:via-neutral-800 to-transparent my-8" />

        {/* * Bottom bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            © 2024-{year} Ciphera. All rights reserved.
          </p>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Where Privacy Still Exists
          </p>
        </div>
      </div>
    </footer>
  )
}
