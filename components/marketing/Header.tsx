'use client'
import React from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { cdnUrl } from '@/lib/cdn'
import { Button } from '@ciphera-net/facet'
import { cn } from '@/lib/utils'
import { initiateOAuthFlow, initiateSignupFlow } from '@/lib/api/oauth'
import { MenuToggleIcon } from '@/components/ui/menu-toggle-icon'
import { createPortal } from 'react-dom'
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from '@/components/ui/navigation-menu'
import {
  ChartBar,
  Eye,
  PlugsConnected,
  ClockCounterClockwise,
  BookOpen,
  Question,
  Cookie,
  ShieldCheck,
  Swap,
  Prohibit,
  GlobeHemisphereWest,
  Wrench,
  LinkSimple,
  Calculator,
  Info,
  Tag,
} from '@phosphor-icons/react/dist/ssr'
import { comparisons, comparisonLogoUrl } from '@/lib/comparisons'

type IconType = React.ComponentType<{ className?: string }>
type LinkItem = {
  title: string
  href: string
  icon?: IconType
  /** Image logo (e.g. competitor marks) — rendered in the same box as icons. */
  logo?: string
  description?: string
  external?: boolean
}

const DOCS_URL = 'https://help.ciphera.net/docs/pulse'

// Product dropdown — the same icon + description ListItem pattern as the
// ciphera.net header, with Pulse's own nav content.
const productLinks: LinkItem[] = [
  { title: 'Features', href: '/features', icon: ChartBar, description: 'Everything Pulse tracks' },
  { title: 'Pricing', href: '/pricing', icon: Tag, description: 'Plans and the free tier' },
  { title: 'Live demo', href: '/demo', icon: Eye, description: 'Real data, no signup' },
  { title: 'Integrations', href: '/integrations', icon: PlugsConnected, description: '75+ framework guides' },
  { title: 'Changelog', href: '/changelog', icon: ClockCounterClockwise, description: "What's new in Pulse" },
]

// Compare dropdown — one row per comparison page, straight from the registry
// (single source of truth: a new entry in lib/comparisons surfaces here, in the
// footer and on /vs automatically). Same ListItem anatomy as every other
// dropdown; the competitor mark sits where the icon would.
const COMPARE_DESCRIPTIONS: Record<string, string> = {
  'google-analytics': 'Leaving the tracking default',
  plausible: 'Lightweight, EU-hosted rival',
  matomo: 'The self-hosted veteran',
  fathom: 'Privacy-first, Canadian-run',
  'simple-analytics': 'Dutch minimalist analytics',
  umami: 'Open-source dashboard',
}

const compareLinks: LinkItem[] = comparisons.map((c) => ({
  title: `vs ${c.name}`,
  href: `/vs/${c.slug}`,
  logo: comparisonLogoUrl(c.slug),
  description: COMPARE_DESCRIPTIONS[c.slug] ?? 'Honest side-by-side',
}))

// Guides + Resources mirror the footer's link groups (owner: the header should
// carry what the footer carries).
const guidesLinks: LinkItem[] = [
  { title: 'Cookieless analytics', href: '/cookieless-analytics', icon: Cookie, description: 'Counting without cookies' },
  { title: 'GDPR-compliant analytics', href: '/gdpr-compliant-analytics', icon: ShieldCheck, description: 'Compliance by architecture' },
  { title: 'GA alternative', href: '/google-analytics-alternative', icon: Swap, description: 'Switching from Google Analytics' },
  { title: 'No cookie banner', href: '/analytics-without-cookie-banner', icon: Prohibit, description: 'Analytics with no consent UI' },
  { title: 'EU web analytics', href: '/eu-web-analytics', icon: GlobeHemisphereWest, description: 'Data that stays in Europe' },
]

const resourcesLinks: LinkItem[] = [
  { title: 'Documentation', href: DOCS_URL, icon: BookOpen, description: 'Setup, script & API guides', external: true },
  { title: 'Installation', href: '/installation', icon: Wrench, description: 'One script tag, any stack' },
  { title: 'FAQ', href: '/faq', icon: Question, description: 'Common questions answered' },
  { title: 'UTM builder', href: '/tools/utm-builder', icon: LinkSimple, description: 'Build campaign URLs' },
  { title: 'Cookie-banner calculator', href: '/tools/cookie-banner-loss-calculator', icon: Calculator, description: 'What a banner costs you' },
  { title: 'About', href: '/about', icon: Info, description: 'Who builds Pulse' },
]

// Grouped mobile panel (a flat list at this size would be a wall of links).
const mobileGroups: { heading: string; links: LinkItem[] }[] = [
  { heading: 'Product', links: productLinks },
  { heading: 'Compare', links: compareLinks.map(({ title, href }) => ({ title, href })) },
  { heading: 'Guides', links: guidesLinks },
  { heading: 'Resources', links: resourcesLinks },
]

export function Header() {
  const [open, setOpen] = React.useState(false)
  const closeMenu = React.useCallback(() => setOpen(false), [])
  const toggleRef = React.useRef<HTMLButtonElement>(null)
  const scrolled = useScroll(10)

  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border">
      <div
        className={cn(
          'absolute inset-0 -z-10 transition-opacity duration-300 motion-reduce:transition-none',
          scrolled ? 'opacity-100 bg-background' : 'opacity-0',
        )}
      />
      <div className="mx-auto w-full max-w-6xl py-3 sm:border-x sm:border-border">
        <nav className="flex h-16 w-full items-center justify-between px-6">
          <div className="flex items-center gap-5">
            <Link href="/" className="-ml-2 flex items-center gap-2 p-2 hover:bg-accent">
              <Image
                src={cdnUrl('/pulse_icon_no_margins.png')}
                alt="Pulse"
                width={36}
                height={36}
                priority
                className="h-8 w-8 object-contain"
                unoptimized
              />
              <span className="text-xl font-bold tracking-tight text-foreground">Pulse</span>
            </Link>
            <div className="hidden md:flex">
              <NavigationMenu>
                <NavigationMenuList>
                  <NavigationMenuItem>
                    <NavigationMenuTrigger className="bg-transparent">Product</NavigationMenuTrigger>
                    <NavigationMenuContent className="bg-transparent p-1 pr-1.5">
                      <ul className="grid w-[32rem] grid-cols-2 gap-2 border border-border bg-card p-2">
                        {productLinks.map((item, i) => (
                          <li key={i}>
                            <ListItem {...item} />
                          </li>
                        ))}
                      </ul>
                      <div className="p-2">
                        <p className="text-sm text-muted-foreground">
                          Want to see it live?{' '}
                          <Link href="/demo" className="font-medium text-foreground hover:underline">
                            Open the demo
                          </Link>
                        </p>
                      </div>
                    </NavigationMenuContent>
                  </NavigationMenuItem>

                  <NavigationMenuItem>
                    <NavigationMenuTrigger className="bg-transparent">Compare</NavigationMenuTrigger>
                    <NavigationMenuContent className="bg-transparent p-1 pr-1.5 pb-1.5">
                      <ul className="grid w-[32rem] grid-cols-2 gap-2 border border-border bg-card p-2">
                        {compareLinks.map((item) => (
                          <li key={item.href}>
                            <ListItem {...item} />
                          </li>
                        ))}
                      </ul>
                    </NavigationMenuContent>
                  </NavigationMenuItem>

                  <NavigationMenuItem>
                    <NavigationMenuTrigger className="bg-transparent">Guides</NavigationMenuTrigger>
                    <NavigationMenuContent className="bg-transparent p-1 pr-1.5 pb-1.5">
                      <ul className="grid w-[32rem] grid-cols-2 gap-2 border border-border bg-card p-2">
                        {guidesLinks.map((item, i) => (
                          <li key={i} className={i === guidesLinks.length - 1 ? 'col-span-2' : undefined}>
                            <ListItem {...item} />
                          </li>
                        ))}
                      </ul>
                    </NavigationMenuContent>
                  </NavigationMenuItem>

                  <NavigationMenuItem>
                    <NavigationMenuTrigger className="bg-transparent">Resources</NavigationMenuTrigger>
                    <NavigationMenuContent className="bg-transparent p-1 pr-1.5 pb-1.5">
                      <ul className="grid w-[36rem] grid-cols-2 gap-2 border border-border bg-card p-2">
                        {resourcesLinks.map((item, i) => (
                          <li key={i}>
                            <ListItem {...item} />
                          </li>
                        ))}
                      </ul>
                    </NavigationMenuContent>
                  </NavigationMenuItem>
                </NavigationMenuList>
              </NavigationMenu>
            </div>
          </div>
          <div className="hidden items-center gap-2 md:flex">
            <Button variant="outline" asChild>
              <button type="button" onClick={() => initiateOAuthFlow()}>
                Sign in
              </button>
            </Button>
            <Button asChild>
              <button type="button" onClick={() => initiateSignupFlow()}>
                Get started
              </button>
            </Button>
          </div>
          <div className="flex items-center gap-2 md:hidden">
            <Button
              ref={toggleRef}
              size="icon"
              variant="outline"
              onClick={() => setOpen(!open)}
              aria-expanded={open}
              aria-controls="mobile-menu"
              aria-label="Toggle menu"
              className="inline-flex min-h-11 min-w-11 items-center justify-center"
            >
              <MenuToggleIcon open={open} className="size-5" duration={300} />
            </Button>
          </div>
        </nav>
      </div>
      <MobileMenu
        open={open}
        onClose={closeMenu}
        triggerRef={toggleRef}
        className="flex flex-col justify-between gap-2 overflow-y-auto"
      >
        <div className="flex w-full flex-col gap-y-1">
          {mobileGroups.map((group) => (
            <React.Fragment key={group.heading}>
              <p className="mt-4 text-xs uppercase tracking-[0.08em] text-muted-foreground first:mt-0">
                {group.heading}
              </p>
              {group.links.map((link) =>
                link.external ? (
                  <a
                    key={link.href}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={closeMenu}
                    className="py-2 text-base text-foreground transition-colors duration-fast motion-reduce:transition-none hover:text-muted-foreground"
                  >
                    {link.title}
                  </a>
                ) : (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={closeMenu}
                    className="py-2 text-base text-foreground transition-colors duration-fast motion-reduce:transition-none hover:text-muted-foreground"
                  >
                    {link.title}
                  </Link>
                ),
              )}
            </React.Fragment>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <Button variant="outline" className="w-full" asChild>
            <button type="button" onClick={() => initiateOAuthFlow()}>
              Sign in
            </button>
          </Button>
          <Button className="w-full" asChild>
            <button type="button" onClick={() => initiateSignupFlow()}>
              Get started
            </button>
          </Button>
        </div>
      </MobileMenu>
    </header>
  )
}

function ListItem({
  title,
  description,
  icon: Icon,
  logo,
  href,
  external,
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuLink> & LinkItem) {
  return (
    <NavigationMenuLink
      className={cn(
        'flex w-full flex-row gap-x-2 p-2 transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground',
        className,
      )}
      {...props}
      asChild
    >
      <a href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
        <div className="flex aspect-square size-12 items-center justify-center border border-border bg-card p-2">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" width={24} height={24} className="size-6 object-contain" loading="lazy" />
          ) : Icon ? (
            <Icon className="size-5 text-foreground" />
          ) : null}
        </div>
        <div className="flex flex-col items-start justify-center">
          <span className="text-sm font-medium">{title}</span>
          <span className="text-xs text-muted-foreground">{description}</span>
        </div>
      </a>
    </NavigationMenuLink>
  )
}

type MobileMenuProps = React.ComponentProps<'div'> & {
  open: boolean
  onClose: () => void
  triggerRef: React.RefObject<HTMLButtonElement | null>
}

function MobileMenu({ open, onClose, triggerRef, children, className, ...props }: MobileMenuProps) {
  const panelRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return

    const panel = panelRef.current
    if (!panel) return

    const FOCUSABLE =
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
    const getFocusable = () =>
      Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      )

    const previouslyFocused = triggerRef.current

    const focusable = getFocusable()
    if (focusable.length > 0) {
      focusable[0].focus()
    } else {
      panel.focus()
    }

    const inertTargets = Array.from(document.querySelectorAll<HTMLElement>('main, footer'))
    inertTargets.forEach((el) => el.setAttribute('inert', ''))

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }

      if (event.key === 'Tab') {
        const items = getFocusable()
        if (items.length === 0) {
          event.preventDefault()
          panel.focus()
          return
        }

        const first = items[0]
        const last = items[items.length - 1]
        const active = document.activeElement

        if (event.shiftKey) {
          if (active === first || !panel.contains(active)) {
            event.preventDefault()
            last.focus()
          }
        } else if (active === last || !panel.contains(active)) {
          event.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      inertTargets.forEach((el) => el.removeAttribute('inert'))
      previouslyFocused?.focus()
    }
  }, [open, onClose, triggerRef])

  if (!open || typeof window === 'undefined') return null

  return createPortal(
    <div
      id="mobile-menu"
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
      tabIndex={-1}
      className={cn(
        'bg-background',
        'fixed top-16 right-0 bottom-0 left-0 z-40 flex flex-col overflow-hidden border-y border-border md:hidden',
      )}
    >
      <div
        data-slot={open ? 'open' : 'closed'}
        className={cn(
          'data-[slot=open]:animate-in data-[slot=open]:zoom-in-95 ease-out',
          'size-full p-4',
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}

function useScroll(threshold: number) {
  const [scrolled, setScrolled] = React.useState(false)

  const onScroll = React.useCallback(() => {
    setScrolled(window.scrollY > threshold)
  }, [threshold])

  React.useEffect(() => {
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [onScroll])

  React.useEffect(() => {
    onScroll()
  }, [onScroll])

  return scrolled
}
