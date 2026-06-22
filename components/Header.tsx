'use client'

import { useState } from 'react'
import {
  UserMenu,
  AppLauncher,
  MenuIcon,
  XIcon,
  type CipheraApp,
  type LinkComponentType,
  type AuthState,
} from '@ciphera-net/facet'

export interface HeaderProps {
  auth: AuthState;
  LinkComponent: LinkComponentType;
  logoSrc: string;
  appName: string | React.ReactNode;
  /** Visual variant. "floating" = fixed bar (marketing). "static" = document-flow bar with bottom border (authenticated). Defaults to "floating". */
  variant?: 'floating' | 'static';
  // * Optional props for organization switching
  orgs?: any[];
  activeOrgId?: string | null;
  onSwitchOrganization?: (orgId: string | null) => void;
  // * Optional prop to create new organization
  onCreateOrganization?: () => void;
  allowPersonalOrganization?: boolean;
  /** Dashboard link in user menu (e.g. "/dashboard"). Defaults to "/". */
  dashboardHref?: string;
  /** Whether to show the FAQ link in the navigation. Defaults to true. */
  showFaq?: boolean;
  /** Whether to show the Pricing link in the navigation. Defaults to false. */
  showPricing?: boolean;
  /** Whether to show the Security link in the navigation. Defaults to true. */
  showSecurity?: boolean;
  /** Optional content rendered below the main header row (e.g. offline banner). */
  bottomContent?: React.ReactNode;
  /** Optional top offset (e.g. "2.5rem") when a fixed bar sits above the header. */
  topOffset?: string;
  /** Custom items to render in the user menu before the sign out button */
  userMenuCustomItems?: React.ReactNode;
  /** Custom navigation items to render in the header bar (e.g. "Tools") */
  customNavItems?: React.ReactNode;
  /** Content to render between theme toggle and user menu (e.g. notification bell) */
  rightSideActions?: React.ReactNode;
  /** Available Ciphera apps for the app switcher in user menu */
  apps?: CipheraApp[];
  /** Current app ID for highlighting in the app switcher */
  currentAppId?: string;
  /** Callback when an app is clicked in the user menu app switcher */
  onAppClick?: (app: CipheraApp) => void;
  /** When provided, opens settings modal instead of navigating to /settings */
  onOpenSettings?: () => void;
  /** Optional left-side content (e.g. sidebar hamburger toggle) rendered before the logo on mobile */
  leftActions?: React.ReactNode;
}

export default function Header({
  auth,
  LinkComponent: Link,
  logoSrc,
  appName,
  variant = 'floating',
  orgs = [],
  activeOrgId = null,
  onSwitchOrganization,
  onCreateOrganization,
  allowPersonalOrganization = true,
  dashboardHref,
  showFaq = true,
  showPricing = false,
  showSecurity = true,
  bottomContent,
  topOffset,
  userMenuCustomItems,
  customNavItems,
  rightSideActions,
  apps = [],
  currentAppId = 'unknown',
  onAppClick,
  onOpenSettings,
  leftActions,
}: HeaderProps) {
  const { user, loading } = auth
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const isStatic = variant === 'static'

  const headerClassName = isStatic
    ? "w-full z-50 border-b border-border bg-card"
    : "fixed left-0 right-0 z-50 flex justify-center px-4 sm:px-6 pt-4 sm:pt-6 transition-transform duration-300 translate-y-0"

  const innerBarClassName = isStatic
    ? "flex w-full items-center justify-between px-4 sm:px-8 py-3.5 transition-all duration-300"
    : `flex w-full items-center justify-between border border-border bg-card px-4 sm:px-8 py-3.5 transition-all duration-300 ${bottomContent ? 'border-b-0' : ''}`

  return (
    <header
      className={headerClassName}
      style={!isStatic && topOffset ? { top: topOffset } : !isStatic ? { top: 0 } : undefined}
    >
      <div className={`flex w-full flex-col gap-0 ${isStatic ? '' : 'max-w-6xl'}`}>
        <div className={innerBarClassName}>
        {/* Left Actions (e.g. sidebar toggle) + Logo Section */}
        <div className="flex items-center gap-2">
        {leftActions}
        <Link
          href="/"
          className="flex items-center gap-3 group relative"
        >
          <div className="relative w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center shrink-0">
            <img
              src={logoSrc}
              alt={`${appName} Logo`}
              className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300 transform-gpu will-change-transform [backface-visibility:hidden]"
            />
          </div>
          <span className="font-display text-xl sm:text-2xl font-bold text-foreground tracking-tight group-hover:text-brand-orange transition-colors duration-300">
            {appName}
          </span>
        </Link>
        </div>

        {/* Navigation Links - Hidden on mobile and for logged-in users */}
        {(!loading && !user || customNavItems) && (
          <nav className="hidden md:flex items-center gap-1">
            {!loading && !user && (
              <>
                <Link
                  href="/about"
                  className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground rounded-none hover:bg-accent transition-all duration-200"
                >
                  Why {appName}
                </Link>
                {showPricing && (
                  <Link
                    href="/pricing"
                    className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground rounded-none hover:bg-accent transition-all duration-200"
                  >
                    Pricing
                  </Link>
                )}
                {showFaq && (
                  <Link
                    href="/faq"
                    className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground rounded-none hover:bg-accent transition-all duration-200"
                  >
                    FAQ
                  </Link>
                )}
                {showSecurity && (
                  <Link
                    href="/security"
                    className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground rounded-none hover:bg-accent transition-all duration-200"
                  >
                    Security
                  </Link>
                )}
              </>
            )}
            {customNavItems}
          </nav>
        )}

        {/* User Menu */}
        <div className="flex items-center gap-3">
          {/* App Launcher - Shows other Ciphera products */}
          {apps.length > 0 && (
            <AppLauncher
              apps={apps}
              currentAppId={currentAppId}
              onAppClick={onAppClick}
            />
          )}
          {rightSideActions}
          <UserMenu
            auth={auth}
            LinkComponent={Link}
            orgs={orgs}
            activeOrgId={activeOrgId}
            onSwitchOrganization={onSwitchOrganization}
            onCreateOrganization={onCreateOrganization}
            allowPersonalOrganization={allowPersonalOrganization}
            dashboardHref={dashboardHref}
            customItems={userMenuCustomItems}
            onOpenSettings={onOpenSettings}
          />

          {/* Mobile Menu Toggle */}
          {!loading && !user && (
            <button
              className="md:hidden p-2 -mr-2 text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {isMobileMenuOpen ? <XIcon className="w-5 h-5" /> : <MenuIcon className="w-5 h-5" />}
            </button>
          )}
        </div>
        </div>
        {bottomContent && (
          <div className={isStatic
            ? "border-t border-border py-2"
            : "overflow-hidden border border-t-0 border-border bg-card py-2"
          }>
            {bottomContent}
          </div>
        )}
      </div>

      {/* Mobile Menu Dropdown */}
      {isMobileMenuOpen && !loading && !user && (
        <div className="absolute top-full left-0 right-0 p-4 md:hidden animate-in slide-in-from-top-2 fade-in duration-200">
          <div className="bg-popover border border-border rounded-none p-2 flex flex-col gap-1">
            <Link
              href="/about"
              className="px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground rounded-none hover:bg-accent transition-all duration-200"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              Why {appName}
            </Link>
            {showPricing && (
              <Link
                href="/pricing"
                className="px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground rounded-none hover:bg-accent transition-all duration-200"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Pricing
              </Link>
            )}
            {showFaq && (
              <Link
                href="/faq"
                className="px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground rounded-none hover:bg-accent transition-all duration-200"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                FAQ
              </Link>
            )}
            {showSecurity && (
              <Link
                href="/security"
                className="px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground rounded-none hover:bg-accent transition-all duration-200"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Security
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
