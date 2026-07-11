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

type NavLink = { title: string; href: string }

const NAV_LINKS: NavLink[] = [
  { title: 'Features', href: '/features' },
  { title: 'Pricing', href: '/pricing' },
  { title: 'Integrations', href: '/integrations' },
  { title: 'Changelog', href: '/changelog' },
  { title: 'FAQ', href: '/faq' },
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
      {/* Background cross-fades in on scroll (transparent over the hero at the
          top of the page). motion-reduce disables the fade. */}
      <div
        className={cn(
          'absolute inset-0 -z-10 transition-opacity duration-300 motion-reduce:transition-none',
          scrolled ? 'opacity-100 bg-background' : 'opacity-0',
        )}
      />
      {/* Same column as the page rails (max-w-6xl + sm:border-x) so the vertical
          lines run continuously from header through every section. py-3 (not a
          nav margin) keeps the rail borders spanning the full header height. */}
      <div className="mx-auto w-full max-w-6xl py-3 sm:border-x sm:border-border">
        <nav className="flex h-16 w-full items-center justify-between px-6">
          <div className="flex items-center gap-5">
            <Link
              href="/"
              className="-ml-2 flex items-center gap-2 p-2 hover:bg-accent"
            >
              <Image
                src={cdnUrl('/pulse_icon_no_margins.png')}
                alt="Pulse"
                width={36}
                height={36}
                priority
                className="h-8 w-8 object-contain"
                unoptimized
              />
              <span className="text-xl font-bold tracking-tight text-foreground">
                Pulse
              </span>
            </Link>
            <div className="hidden items-center gap-6 md:flex">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm text-muted-foreground transition-colors duration-fast motion-reduce:transition-none hover:text-foreground"
                >
                  {link.title}
                </Link>
              ))}
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
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={closeMenu}
              className="py-2 text-base text-foreground transition-colors duration-fast motion-reduce:transition-none hover:text-muted-foreground"
            >
              {link.title}
            </Link>
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

type MobileMenuProps = React.ComponentProps<'div'> & {
  open: boolean
  onClose: () => void
  triggerRef: React.RefObject<HTMLButtonElement | null>
}

function MobileMenu({
  open,
  onClose,
  triggerRef,
  children,
  className,
  ...props
}: MobileMenuProps) {
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

    // Restore focus to the toggle button on close/unmount.
    const previouslyFocused = triggerRef.current

    // Move focus into the panel: first focusable element, or the panel itself.
    const focusable = getFocusable()
    if (focusable.length > 0) {
      focusable[0].focus()
    } else {
      panel.focus()
    }

    // Inert the background so screen readers / tab order skip it while open.
    // The header is intentionally left reachable so the toggle stays usable.
    const inertTargets = Array.from(
      document.querySelectorAll<HTMLElement>('main, footer'),
    )
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

  // Also check on first load.
  React.useEffect(() => {
    onScroll()
  }, [onScroll])

  return scrolled
}
