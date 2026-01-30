'use client'

import Link from 'next/link'
import Image from 'next/image'
import { GithubIcon, TwitterIcon } from '@ciphera-net/ui'
import SwissFlagIcon from './SwissFlagIcon'

const footerLinks = {
  features: [
    { name: 'Analytics', href: '/#features', external: false },
    { name: 'Security', href: '/security', external: false },
    { name: 'FAQ', href: '/faq', external: false },
    { name: 'Get Started', href: '/signup', external: false },
  ],
  company: [
    { name: 'About Pulse', href: '/about', external: false },
    { name: 'Ciphera', href: 'https://ciphera.net', external: true },
    { name: 'Drop', href: 'https://drop.ciphera.net', external: true },
  ],
  resources: [
    { name: 'Documentation', href: '#', external: false },
    { name: 'GitHub', href: 'https://github.com/ciphera-net', external: true },
  ],
  legal: [
    { name: 'Privacy Policy', href: 'https://ciphera.net/privacy', external: true },
    { name: 'Terms of Service', href: 'https://ciphera.net/terms', external: true },
  ],
}

// * Pulse website footer - customized for Pulse branding
export default function WebsiteFooter() {
  const year = new Date().getFullYear()

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
                className="w-9 h-9 group-hover:scale-105 transition-transform duration-300"
              />
              <span className="text-xl font-bold text-neutral-900 dark:text-white group-hover:text-brand-orange transition-colors duration-300">
                Pulse
              </span>
            </Link>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4 leading-relaxed">
              Simple, privacy-first web analytics that doesn't compromise your users' data.
            </p>
            <div className="inline-flex items-center gap-2.5 text-sm text-neutral-600 dark:text-neutral-400 mb-4">
              <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-neutral-100 dark:bg-neutral-800 shrink-0 overflow-hidden ring-1 ring-neutral-200 dark:ring-neutral-700" aria-hidden>
                <SwissFlagIcon className="w-5 h-5" />
              </span>
              <span>Swiss infrastructure (Zurich).</span>
            </div>
            <div className="flex items-center gap-3">
              <a
                href="https://github.com/ciphera-net"
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-lg bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-600 dark:text-neutral-400 hover:text-brand-orange dark:hover:text-brand-orange hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                aria-label="GitHub"
              >
                <GithubIcon className="w-5 h-5" />
              </a>
              <a
                href="#"
                className="w-9 h-9 rounded-lg bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-600 dark:text-neutral-400 hover:text-brand-orange dark:hover:text-brand-orange hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                aria-label="Twitter"
              >
                <TwitterIcon className="w-5 h-5" />
              </a>
            </div>
          </div>

          {/* * Features */}
          <div>
            <h4 className="font-semibold text-neutral-900 dark:text-white mb-4">Platform</h4>
            <ul className="space-y-3">
              {footerLinks.features.map((link) => (
                <li key={link.name}>
                  {link.external ? (
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-neutral-600 dark:text-neutral-400 hover:text-brand-orange dark:hover:text-brand-orange transition-colors"
                    >
                      {link.name}
                    </a>
                  ) : (
                    <Link
                      href={link.href}
                      className="text-sm text-neutral-600 dark:text-neutral-400 hover:text-brand-orange dark:hover:text-brand-orange transition-colors"
                    >
                      {link.name}
                    </Link>
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
                      className="text-sm text-neutral-600 dark:text-neutral-400 hover:text-brand-orange dark:hover:text-brand-orange transition-colors"
                    >
                      {link.name}
                    </a>
                  ) : (
                    <Link
                      href={link.href}
                      className="text-sm text-neutral-600 dark:text-neutral-400 hover:text-brand-orange dark:hover:text-brand-orange transition-colors"
                    >
                      {link.name}
                    </Link>
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
                      className="text-sm text-neutral-600 dark:text-neutral-400 hover:text-brand-orange dark:hover:text-brand-orange transition-colors"
                    >
                      {link.name}
                    </a>
                  ) : (
                    <Link
                      href={link.href}
                      className="text-sm text-neutral-600 dark:text-neutral-400 hover:text-brand-orange dark:hover:text-brand-orange transition-colors"
                    >
                      {link.name}
                    </Link>
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
                  {link.external ? (
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-neutral-600 dark:text-neutral-400 hover:text-brand-orange dark:hover:text-brand-orange transition-colors"
                    >
                      {link.name}
                    </a>
                  ) : (
                    <Link
                      href={link.href}
                      className="text-sm text-neutral-600 dark:text-neutral-400 hover:text-brand-orange dark:hover:text-brand-orange transition-colors"
                    >
                      {link.name}
                    </Link>
                  )}
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
