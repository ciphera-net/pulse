import Link from 'next/link'
import type { ComponentProps } from 'react'
import { isMarketingPath } from '@/lib/marketing-paths'

type Props = ComponentProps<typeof Link>

/**
 * next/link for the dashboard's own pages, a plain anchor for the marketing
 * app's (see lib/marketing-paths.ts). Use it wherever a link can point at a
 * marketing page, so the dashboard's router never prefetches or renders them.
 */
export function AppLink({ href, prefetch, replace, scroll, shallow, passHref, legacyBehavior, locale, onNavigate, ...rest }: Props) {
  if (typeof href === 'string' && isMarketingPath(href)) {
    return <a href={href} {...rest} />
  }
  return (
    <Link
      href={href}
      prefetch={prefetch}
      replace={replace}
      scroll={scroll}
      shallow={shallow}
      passHref={passHref}
      legacyBehavior={legacyBehavior}
      locale={locale}
      onNavigate={onNavigate}
      {...rest}
    />
  )
}
